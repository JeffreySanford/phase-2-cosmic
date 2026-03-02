FROM maven:3.9.4-eclipse-temurin-17 AS builder
WORKDIR /workspace
COPY pom-parent.xml /pom-parent.xml
RUN mvn -f /pom-parent.xml -DskipTests install
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package spring-boot:repackage

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=builder /workspace/target/java-ingest-0.0.1-SNAPSHOT.jar ./app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
