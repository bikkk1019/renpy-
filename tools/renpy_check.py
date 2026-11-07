"""Local Ren'Py check/run companion. Uses the installed SDK, with no server or network."""
import argparse
import os
import subprocess
import threading
from pathlib import Path

DEFAULT_SDK = Path(os.environ.get("RENPY_SDK", str(Path.home())))
DEFAULT_PROJECT = Path(os.environ.get("RENPY_PROJECT", str(Path.home())))


def command(sdk, project, action="lint"):
    sdk, project = Path(sdk).resolve(), Path(project).resolve()
    if project.name.lower() == "game":
        project = project.parent
    executable = sdk / "lib" / "py3-windows-x86_64" / "python.exe"
    entry = sdk / "renpy.py"
    if not executable.is_file() or not entry.is_file():
        raise ValueError("请选择包含 renpy.py 的 Ren'Py SDK 文件夹")
    if not (project / "game").is_dir():
        raise ValueError("请选择包含 game 文件夹的游戏工程")
    args = [str(executable), str(entry), str(project), action]
    if action == "lint":
        args.append("--error-code")
    return args, project


def check(sdk, project):
    args, project = command(sdk, project)
    result = subprocess.run(args, cwd=project, capture_output=True, encoding="utf-8", errors="replace",
                            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return result.returncode, result.stdout + result.stderr


def gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, scrolledtext
    root = tk.Tk()
    root.title("Ren'Py 工程检查与试玩")
    root.geometry("900x650")
    sdk, project = tk.StringVar(value=str(DEFAULT_SDK)), tk.StringVar(value=str(DEFAULT_PROJECT))
    for label, variable in [("Ren'Py SDK", sdk), ("游戏工程", project)]:
        frame = tk.Frame(root)
        frame.pack(fill="x", padx=14, pady=7)
        tk.Label(frame, text=label, width=12).pack(side="left")
        tk.Entry(frame, textvariable=variable).pack(side="left", fill="x", expand=True)
        def browse(v=variable):
            selected = filedialog.askdirectory(initialdir=v.get())
            if selected:
                v.set(selected)
        tk.Button(frame, text="选择…", command=browse).pack(side="left", padx=6)
    tk.Label(root, text="先在生成器中将脚本写入游戏工程，再检查或试玩。检查会使用 Ren'Py 正常生成缓存。",
             anchor="w").pack(fill="x", padx=14)
    output = scrolledtext.ScrolledText(root, wrap="word", font=("Consolas", 11))
    status = tk.StringVar(value="就绪")
    controls = tk.Frame(root)
    controls.pack(fill="x", padx=14, pady=8)
    output.pack(fill="both", expand=True, padx=14, pady=8)
    tk.Label(root, textvariable=status, anchor="w").pack(fill="x", padx=14, pady=8)

    def complete(code, text):
        output.delete("1.0", "end")
        output.insert("end", text or "引擎未输出报告。")
        status.set("检查通过；仍需试玩演出和分支。" if code == 0 else "检查失败，请按报告中的文件和行号修复。")
        check_button.config(state="normal")

    def run_check():
        sdk_path, project_path = sdk.get(), project.get()
        check_button.config(state="disabled")
        status.set("正在运行 Ren'Py 检查…")
        def worker():
            try:
                code, text = check(sdk_path, project_path)
            except Exception as error:
                code, text = 1, str(error)
            root.after(0, complete, code, text)
        threading.Thread(target=worker, daemon=True).start()

    def play():
        try:
            args, directory = command(sdk.get(), project.get(), "run")
            subprocess.Popen(args, cwd=directory, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            status.set("已启动游戏试玩。")
        except Exception as error:
            messagebox.showerror("无法启动", str(error))

    def save_report():
        filename = filedialog.asksaveasfilename(defaultextension=".txt", filetypes=[("文本报告", "*.txt")])
        if filename:
            Path(filename).write_text(output.get("1.0", "end"), encoding="utf-8")

    check_button = tk.Button(controls, text="检查脚本", command=run_check)
    check_button.pack(side="left", padx=4)
    tk.Button(controls, text="启动试玩", command=play).pack(side="left", padx=4)
    tk.Button(controls, text="保存报告", command=save_report).pack(side="left", padx=4)
    root.mainloop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, default=DEFAULT_SDK)
    parser.add_argument("--project", type=Path, default=DEFAULT_PROJECT)
    parser.add_argument("--lint", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if args.lint:
        code, text = check(args.sdk, args.project)
        if args.report:
            args.report.write_text(text, encoding="utf-8")
        else:
            print(text)
        raise SystemExit(code)
    gui()
