# Quick How-To (LAN)

1. Start the Avatar UI:
	- Open PowerShell in TalkToMe
	- Run: `npm run start:avatar:lan`
2. Start the shared API/LAN server (required for `PUT /api/output-json`):
	- Open PowerShell in TalkToMe
	- Run: `npm start`
3. Share this URL on your Wi-Fi: http://192.168.2.33:5500/

Notes:
- The root server on port `5500` proxies UI requests to `http://127.0.0.1:5173`.
- If you changed the UI port or host, set `AVATAR_UI_URL` before `npm start`.

If it does not open on another device, allow Node.js in Windows Firewall (Private network).

## Stop Servers

- If the server is running in a terminal window: press Ctrl+C in that terminal.
- Stop one server by port (example 5500):
	1. Get PID: Get-NetTCPConnection -LocalPort 5500 -State Listen | Select-Object -ExpandProperty OwningProcess
	2. Stop PID: Stop-Process -Id <PID> -Force
- Stop all Node-based dev servers:
	- Get-Process node | Stop-Process -Force