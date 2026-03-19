import subprocess
import os
import sys
import time

root = os.path.dirname(os.path.abspath(__file__))

print("🚀 Запуск Backend сервера...")
backend = subprocess.Popen(
    [sys.executable, "server.py"],
    cwd=os.path.join(root, "backend")
)

print("🚀 Запуск Frontend сервера (Vite)...")
# КЛЮЧЕВОЙ МОМЕНТ 1: Для Windows обязательно указываем npm.cmd
npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

frontend = subprocess.Popen(
    [npm_cmd, "run", "dev"],
    cwd=root,
    shell=False  # КЛЮЧЕВОЙ МОМЕНТ 2: Убираем shell=True, чтобы не было вопроса [Y/N]
)

try:
    # КЛЮЧЕВОЙ МОМЕНТ 3: Используем бесконечный цикл вместо .wait()
    # Метод .wait() в Windows часто блокирует перехват Ctrl+C
    while True:
        time.sleep(1)
        
        # Если вдруг один из серверов упадет сам (например, ошибка в коде),
        # скрипт это заметит и остановит второй сервер.
        if backend.poll() is not None or frontend.poll() is not None:
            print("\n⚠️ Один из серверов неожиданно завершил работу.")
            break

except KeyboardInterrupt:
    print("\n🛑 Получен сигнал остановки (Ctrl+C).")

finally:
    # Блок finally гарантирует, что процессы убьются в любом случае (даже при ошибке)
    print("Закрываем процессы...")
    backend.terminate()
    frontend.terminate()
    
    backend.wait()
    frontend.wait()
    print("✅ Серверы успешно остановлены.")