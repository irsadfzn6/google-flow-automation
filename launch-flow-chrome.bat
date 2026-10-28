@echo off
echo Membuka Chrome untuk Google Flow Automation (Port 9222)...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="%USERPROFILE%\.config\google-chrome-flow" "https://flow.google.com"
echo Chrome berhasil dibuka! Silakan login akun Google Anda di jendela Chrome tersebut jika belum login.
exit
