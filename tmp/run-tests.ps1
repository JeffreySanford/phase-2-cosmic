$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot'
$env:Path = $env:JAVA_HOME + '\\bin;' + $env:Path
java -version
pnpm run unit-test > tmp/ci-unit5.out 2>&1
exit $LASTEXITCODE
