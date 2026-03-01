@echo off
REM Maven Wrapper (Windows)
SET "SCRIPT_DIR=%~dp0"
SET "MAVEN_WRAPPER_JAR=%SCRIPT_DIR%\.mvn\wrapper\maven-wrapper.jar"
IF NOT EXIST "%MAVEN_WRAPPER_JAR%" (
  echo Missing Maven wrapper jar: %MAVEN_WRAPPER_JAR%
  exit /b 1
)
java -jar "%MAVEN_WRAPPER_JAR%" %*
