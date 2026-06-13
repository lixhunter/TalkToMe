# Quick How-To (LAN)

1. Start the shared API server (required for `PUT /api/output-json`):
	- Open PowerShell in TalkToMe
	- Run: `npm start`
2. Open a second PowerShell in TalkToMe/docker/Avatar.
3. Run: `npm run dev -- --host 0.0.0.0 --port 5502`
4. Share this URL on your Wi-Fi: http://192.168.2.33:5502/

Notes:
- The Vite server on port `5502` now proxies `/api/*` to `http://127.0.0.1:5500`.
- If you call the API directly from curl, use port `5500`.

If it does not open on another device, allow Node.js in Windows Firewall (Private network).

## Stop Servers

- If the server is running in a terminal window: press Ctrl+C in that terminal.
- Stop one server by port (example 5502):
	1. Get PID: Get-NetTCPConnection -LocalPort 5502 -State Listen | Select-Object -ExpandProperty OwningProcess
	2. Stop PID: Stop-Process -Id <PID> -Force
- Stop all Node-based dev servers:
	- Get-Process node | Stop-Process -Force