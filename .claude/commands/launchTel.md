---
description: Lance tout le projet (lobby + vite + tunnel HTTPS) pour jouer depuis un téléphone, et renvoie l'URL à taper.
allowed-tools: Bash, PowerShell, Read, Edit
---

# Lancer le projet sur téléphone 📱

Quand l'utilisateur tape `/launchTel`, démarre toute la stack pour qu'il puisse
jouer depuis son téléphone (caméra incluse), et donne-lui **une seule URL HTTPS**
à ouvrir. Suis ces étapes dans l'ordre, sans poser de question — fais tout toi-même.

## Pré-requis (vérifie en silence)
- `cloudflared` : cherche d'abord dans le PATH, puis dans le dossier du projet
  (`.\cloudflared.exe`). S'il n'est nulle part, **télécharge-le silencieusement**
  dans le dossier du projet sans demander à l'utilisateur :
  ```powershell
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "D:\Application coder\elmuerto\cloudflared.exe" -UseBasicParsing
  ```
  Utilise ensuite `.\cloudflared.exe` pour toutes les commandes cloudflared.
- Le port vite utilisé ici est **5180** (fixe), le serveur de lobby **8080**.
- `vite.config.js` doit déjà contenir `host: true`, `allowedHosts: true` et le
  proxy `'/ws' -> ws://localhost:8080`. Si ce n'est pas le cas, ajoute-le avant de
  lancer (sinon le tunnel et le multijoueur ne marcheront pas).

## 1. Nettoyer les anciennes instances
Tue ce qui écoute déjà sur 5180 et 8080, et les éventuels tunnels cloudflared
restés ouverts, pour repartir propre (PowerShell) :
```
foreach ($port in 5180,8080) {
  $pids = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess
  if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }
}
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
# Tue aussi le cloudflared.exe local s'il tourne
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
```

## 2. Démarrer le serveur de lobby (WebSocket, port 8080)
Lance en arrière-plan (`run_in_background: true`), depuis le dossier du projet :
```
npm run server
```
Attends de voir « Serveur de lobby en écoute sur ws://localhost:8080 » dans son log.

## 3. Démarrer Vite (port fixe 5180)
Lance en arrière-plan (`run_in_background: true`) :
```
npm run dev -- --port 5180 --strictPort
```
Attends que le log affiche « ready » / « Local: http://localhost:5180/ », puis
vérifie : `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5180/` doit
renvoyer `200`.

## 4. Démarrer le tunnel HTTPS public (cloudflared)
Lance en arrière-plan (`run_in_background: true`), en utilisant `.\cloudflared.exe`
si cloudflared n'est pas dans le PATH :
```
.\cloudflared.exe tunnel --url http://localhost:5180 --no-autoupdate
```
Attends ~6-8 s, puis extrais l'URL publique depuis le fichier de log du process :
```
grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" <fichier_log_cloudflared> | head -1
```

## 5. Vérifier que tout passe par le tunnel
Avec l'URL trouvée (note `$URL`), vérifie 3 routes (toutes doivent renvoyer 200) :
- `$URL/`               (le lobby)
- `$URL/colorhunt.html` (le jeu Color Hunt en solo)
- `$URL/src/colorhunt/main.js` (un module, prouve que vite sert bien les sources)

Puis teste le WebSocket **à travers le tunnel** avec un petit client. Écris un
fichier temporaire `_wstest.mjs` **dans le dossier du projet** (pour qu'il trouve
le module `ws` des node_modules), exécute-le, puis supprime-le :
```js
import WebSocket from 'ws';
const ws = new WebSocket(process.argv[2]);
const t = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 8000);
ws.on('open', () => ws.send(JSON.stringify({ type: 'create', name: 'TestPhone' })));
ws.on('message', (d) => { const m = JSON.parse(d.toString());
  if (m.type === 'created') { console.log('OK code =', m.code); clearTimeout(t); ws.close(); process.exit(0); } });
ws.on('error', (e) => { console.log('ERROR', e.message); process.exit(1); });
```
Lance-le sur `wss://<host-du-tunnel>/ws`. Si ça affiche « OK code = … », le
multijoueur fonctionne depuis le téléphone.

## 6. Afficher le QR code dans le terminal (toujours)
Génère **systématiquement** (sans demander) un QR code ASCII de `$URL/` et
affiche-le dans le terminal, dans un bloc de code, pour que l'utilisateur puisse
le scanner directement avec l'appareil photo de son téléphone. Récupère-le via
qrenco.de (renvoie un QR en caractères Unicode) :
```
curl -s "https://qrenco.de/<URL>/" -H "User-Agent: curl"
```
Recopie le résultat tel quel dans un bloc ``` ``` ``` dans ta réponse. Si
qrenco.de échoue (pas de réseau, etc.), bascule en secours sur un PNG :
```powershell
$enc = [uri]::EscapeDataString("<URL>/")
Invoke-WebRequest -Uri "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=$enc" -OutFile ".\qr-launch.png" -UseBasicParsing
```
et indique le chemin du fichier `qr-launch.png`.

## 7. Donner le résultat à l'utilisateur
Termine par un message court et clair façon :

> 📱 **Ouvre cette URL sur ton téléphone (ou scanne le QR code ci-dessus) :**
> ### 👉 `<URL>/`
> (Color Hunt seul : `<URL>/colorhunt.html`)
>
> Tout est en marche (lobby 8080 ✅ · vite 5180 ✅ · tunnel ✅).
> Laisse cette session Claude Code ouverte pendant que vous jouez.
> ⚠️ L'URL change à chaque relance — relance `/launchTel` pour en regénérer une.

## Notes
- Si un port est déjà occupé, c'est qu'une instance tourne encore : l'étape 1
  doit l'avoir tuée ; si `--strictPort` échoue quand même, retue le process sur
  5180 puis relance vite.
- Ne lance jamais ces process au premier plan (ça bloquerait la session) :
  toujours `run_in_background: true`.
- Le QR code ASCII (étape 6) est désormais affiché **automatiquement à chaque
  lancement** dans le terminal — pas besoin que l'utilisateur le demande.
