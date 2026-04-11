import subprocess
import os
import sys
import time

root = os.path.dirname(os.path.abspath(__file__))

print("Zapusk Backend servera...")
backend = subprocess.Popen(
    [sys.executable, "server.py"],
    cwd=os.path.join(root, "backend")
)

print("Zapusk Frontend servera (Vite)...")
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
            print("\nOdin iz serverov neozhidanno zavershil rabotu.")
            break

except KeyboardInterrupt:
    print("\nPoluchен signal ostanovki (Ctrl+C).")

finally:
    # Блок finally гарантирует, что процессы убьются в любом случае (даже при ошибке)
    print("Zakryvaem processy...")
    backend.terminate()
    frontend.terminate()

    backend.wait()
    frontend.wait()
    print("Servery uspeshno ostanovleny.")