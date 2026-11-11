@echo off
cd /d "%~dp0"
node scripts/local-tls.mjs data/tls
if errorlevel 1 exit /b 1
set "TLS_CERT_FILE=%CD%\data\tls\localhost-cert.pem"
set "TLS_KEY_FILE=%CD%\data\tls\localhost-key.pem"
set "PORT=3443"
echo HTTPS local endpoint: https://127.0.0.1:3443
echo The certificate is local-only. No Windows trust settings are changed.
echo Read HTTPS-LOCAL.md before using this endpoint in a browser.
node supervisor.mjs
pause
