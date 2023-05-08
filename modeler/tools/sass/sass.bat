@echo off
REM This script drives the standalone dart-sass package, which bundles together a
REM Dart executable and a snapshot of dart-sass.

set SCRIPTPATH=%~dp0
set arguments=%*
"%SCRIPTPATH%\win-x64\dart.exe" "%SCRIPTPATH%\win-x64\sass.snapshot" %arguments%
