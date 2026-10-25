@echo off
curl.exe -s --noproxy 127.0.0.1 http://127.0.0.1:6060/v1/chat/completions -H "Content-Type: application/json" -d "{\"model\":\"router-random-0.5\",\"messages\":[{\"role\":\"user\",\"content\":\"Say OK\"}]}"
