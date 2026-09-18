# Auralis — Web3 Music Streaming Platform

A portfolio-grade learning project: Spotify-inspired music streaming UI + Node/Express API + PostgreSQL + Web3-ready wallet/ownership layer.

## Run locally

Requirements: Docker + Docker Compose.

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f
```

Open:

http://localhost:8080

API:

http://localhost:8080/api/health
http://localhost:8080/api/tracks
http://localhost:8080/api/artists
http://localhost:8080/api/overview

Stop:

```bash
docker compose down --volumes --remove-orphans
```

## Architecture

Browser -> Nginx/React-style static frontend -> Node/Express API -> PostgreSQL

The current frontend uses plain HTML/CSS/JS to keep the first DevSecOps iteration easy to understand. The API and database are real. Web3 wallet integration is represented by a safe demo wallet layer and is the next stage.

## Next stages

1. Docker
2. GitHub
3. GitHub Actions
4. SonarQube
5. OWASP Dependency-Check
6. Trivy
7. Gitleaks / CodeQL
8. Solidity + Hardhat + OpenZeppelin
9. Slither
10. OCI OCIR
11. Oracle Kubernetes Engine
12. Argo CD
13. Prometheus + Grafana
14. OWASP ZAP
15. OCI Vault, Cosign, SBOM, Kyverno, RBAC and NetworkPolicies

Do not put real private keys, wallet seed phrases, OCI credentials, or production secrets into Git.
