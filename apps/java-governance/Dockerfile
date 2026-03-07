# syntax=docker/dockerfile:1.7
FROM maven:3.9.4-eclipse-temurin-21 AS builder
WORKDIR /workspace
COPY pom-parent.xml /pom-parent.xml
COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 mvn -B -f pom.xml -DskipTests dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -T 1C package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /workspace/target/java-governance-0.1.0-SNAPSHOT.jar /app/java-governance.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/java-governance.jar"]
