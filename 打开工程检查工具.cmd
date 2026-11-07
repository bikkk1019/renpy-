@echo off
python "%~dp0tools\renpy_check.py"
if errorlevel 1 pause
