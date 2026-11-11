@echo off
cd /d "%~dp0"
node -e "require('node:fs').mkdirSync('data',{recursive:true});require('node:fs').writeFileSync('data/internet-share.stop','stop')"
echo Stop requested. The internet link should close within a few seconds.
pause
