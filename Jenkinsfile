pipeline {
    agent any

    tools {
        nodejs 'NodeJS-22'
    }

    environment {
        APP_IMAGE = 'auralis-backend'
        FRONTEND_IMAGE = 'auralis-frontend'
        APP_VERSION = "${BUILD_NUMBER}"

        DOCKERHUB_BACKEND_REPOSITORY = '0x1k4rt1k/auralis-backend'
        DOCKERHUB_FRONTEND_REPOSITORY = '0x1k4rt1k/auralis-frontend'

        SYFT_VERSION = 'v1.52.0'
        GRYPE_IMAGE = 'anchore/grype:latest'
        GITLEAKS_IMAGE = 'zricethezav/gitleaks:latest'
        COSIGN_IMAGE = 'ghcr.io/sigstore/cosign/cosign:latest'
        ZAP_IMAGE = 'ghcr.io/zaproxy/zaproxy:stable'

        DAST_TARGET = 'http://frontend:8080'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm

                script {
                    env.GIT_COMMIT_SHA = sh(
                        script: 'git rev-parse HEAD',
                        returnStdout: true
                    ).trim()

                    env.GIT_COMMIT_SHORT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                }

                sh '''
                    echo "===== Git Information ====="
                    echo "Commit SHA: ${GIT_COMMIT_SHA}"
                    echo "Short SHA: ${GIT_COMMIT_SHORT}"
                    git log -1 --oneline
                '''
            }
        }

        stage('Environment Check') {
            steps {
                sh '''
                    echo "===== Environment Check ====="

                    echo "Node version:"
                    node --version

                    echo "NPM version:"
                    npm --version

                    echo "Git version:"
                    git --version

                    echo "Docker version:"
                    docker --version

                    echo "Docker Compose version:"
                    docker compose version

                    echo "Jenkins Build:"
                    echo "${BUILD_NUMBER}"

                    echo "Git Commit:"
                    echo "${GIT_COMMIT_SHA}"

                    echo "Backend Docker Hub Repository:"
                    echo "${DOCKERHUB_BACKEND_REPOSITORY}"

                    echo "Frontend Docker Hub Repository:"
                    echo "${DOCKERHUB_FRONTEND_REPOSITORY}"
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                dir('backend') {
                    sh 'npm ci'
                }
            }
        }

        stage('Unit Tests + Coverage') {
            steps {
                dir('backend') {
                    sh '''
                        set -e

                        echo "===== Unit Tests + Coverage ====="

                        rm -rf coverage
                        mkdir -p coverage

                        npm test -- \
                            --experimental-test-coverage \
                            --test-reporter=spec \
                            --test-reporter-destination=stdout \
                            --test-reporter=lcov \
                            --test-reporter-destination=coverage/lcov.info

                        test -s coverage/lcov.info

                        echo "Coverage report generated:"
                        ls -lh coverage/lcov.info
                    '''
                }
            }
        }

        stage('ESLint') {
            steps {
                dir('backend') {
                    sh 'npm run lint'
                }
            }
        }

        stage('SonarQube SAST') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    withCredentials([
                        string(
                            credentialsId: 'sonar-token',
                            variable: 'SONAR_TOKEN'
                        )
                    ]) {
                        script {
                            def scannerHome = tool 'SonarScanner'

                            sh """
                                echo "===== SonarQube SAST ====="

                                echo "SonarScanner location:"
                                echo "${scannerHome}"

                                echo "SonarScanner version:"
                                ${scannerHome}/bin/sonar-scanner --version

                                ${scannerHome}/bin/sonar-scanner \
                                    -Dsonar.token="\$SONAR_TOKEN" \
                                    -Dsonar.javascript.lcov.reportPaths=backend/coverage/lcov.info
                            """
                        }
                    }
                }
            }
        }

        stage('SonarQube Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: false
                }
            }
        }

        stage('Gitleaks Secret Scan') {
            steps {
                sh '''
                    set +e

                    echo "========================================"
                    echo "Gitleaks Secret Scan"
                    echo "========================================"

                    REPORT_DIR="${WORKSPACE}/gitleaks-report"
                    REPORT_FILE="${REPORT_DIR}/gitleaks.json"
                    CONTAINER_NAME="auralis-gitleaks-${BUILD_NUMBER}"

                    mkdir -p "${REPORT_DIR}"
                    rm -f "${REPORT_FILE}"

                    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

                    docker create \
                        --name "${CONTAINER_NAME}" \
                        -v "${WORKSPACE}:/repo:ro" \
                        ${GITLEAKS_IMAGE} \
                        detect \
                        --source=/repo \
                        --no-git \
                        --no-banner \
                        --redact \
                        --report-format json \
                        --report-path /tmp/gitleaks.json \
                        --exit-code 1

                    docker start -a "${CONTAINER_NAME}"
                    GITLEAKS_EXIT=$?

                    docker cp \
                        "${CONTAINER_NAME}:/tmp/gitleaks.json" \
                        "${REPORT_FILE}" >/dev/null 2>&1 || true

                    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

                    echo "Gitleaks exit code: ${GITLEAKS_EXIT}"

                    if [ -s "${REPORT_FILE}" ]; then
                        echo "Gitleaks report generated:"
                        ls -lh "${REPORT_FILE}"
                    else
                        echo "No Gitleaks JSON report was generated."
                    fi

                    echo "Gitleaks is currently REPORT-ONLY."

                    exit 0
                '''
            }
        }

        stage('OWASP Dependency-Check') {
            steps {
                sh 'mkdir -p dependency-check-report'

                withCredentials([
                    string(
                        credentialsId: 'nvd-api-key',
                        variable: 'NVD_API_KEY'
                    )
                ]) {
                    dependencyCheck(
                        odcInstallation: 'OWASP-Dependency-Check',
                        additionalArguments: "--scan backend --format HTML --format XML --out dependency-check-report --nvdApiKey ${NVD_API_KEY}"
                    )
                }
            }
        }

        stage('Dependency Security Gate') {
            steps {
                dependencyCheckPublisher(
                    pattern: 'dependency-check-report/dependency-check-report.xml'
                )
            }
        }

        stage('Backend Docker Build') {
            steps {
                sh '''
                    set -e

                    echo "===== Backend Docker Build ====="

                    docker build \
                        -t ${APP_IMAGE}:${APP_VERSION} \
                        -t ${APP_IMAGE}:latest \
                        ./backend
                '''
            }
        }

        stage('Backend Docker Image Check') {
            steps {
                sh '''
                    set -e

                    echo "===== Backend Docker Image Check ====="

                    docker images ${APP_IMAGE}

                    echo "Backend Image ID:"

                    docker image inspect \
                        --format='{{.Id}}' \
                        ${APP_IMAGE}:${APP_VERSION}
                '''
            }
        }

        stage('Backend Trivy Scan') {
            steps {
                sh '''
                    echo "===== Backend Trivy Security Scan ====="

                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        aquasec/trivy:latest \
                        image \
                        --severity HIGH,CRITICAL \
                        --exit-code 0 \
                        ${APP_IMAGE}:${APP_VERSION}
                '''
            }
        }

        stage('Prepare SBOM Directory') {
            steps {
                sh '''
                    echo "===== Preparing SBOM Directory ====="

                    rm -rf "${WORKSPACE}/sbom"
                    mkdir -p "${WORKSPACE}/sbom"
                '''
            }
        }

        stage('Backend SBOM + Grype') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "Backend SBOM Generation"
                    echo "========================================"

                    SBOM_VOLUME="auralis-sbom-backend-${BUILD_NUMBER}"
                    SBOM_FILE="backend-${APP_VERSION}-sbom.json"
                    GRYPE_FILE="backend-${APP_VERSION}-grype.json"
                    SBOM_CONTAINER="auralis-sbom-extract-backend-${BUILD_NUMBER}"

                    docker rm -f "${SBOM_CONTAINER}" >/dev/null 2>&1 || true
                    docker volume rm "${SBOM_VOLUME}" >/dev/null 2>&1 || true
                    docker volume create "${SBOM_VOLUME}" >/dev/null

                    docker image inspect \
                        "${APP_IMAGE}:${APP_VERSION}" >/dev/null

                    echo "Running Syft ${SYFT_VERSION}..."

                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        -v "${SBOM_VOLUME}:/work" \
                        ghcr.io/anchore/syft:${SYFT_VERSION} \
                        "docker:${APP_IMAGE}:${APP_VERSION}" \
                        -o "cyclonedx-json=/work/${SBOM_FILE}"

                    echo "Validating SBOM..."

                    docker run --rm \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        alpine:latest \
                        sh -c "test -s /work/${SBOM_FILE} && ls -lh /work/${SBOM_FILE}"

                    echo "========================================"
                    echo "Backend Grype Vulnerability Scan"
                    echo "========================================"

                    docker run --rm \
                        -v "${SBOM_VOLUME}:/work:rw" \
                        ${GRYPE_IMAGE} \
                        "sbom:/work/${SBOM_FILE}" \
                        -o json \
                        --file "/work/${GRYPE_FILE}"

                    echo "Grype report generated."

                    docker run --rm \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        alpine:latest \
                        sh -c "test -s /work/${GRYPE_FILE} && ls -lh /work/${GRYPE_FILE}"

                    echo ""
                    echo "===== Backend Grype Results ====="

                    docker run --rm \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        ${GRYPE_IMAGE} \
                        "sbom:/work/${SBOM_FILE}"

                    echo "Creating extraction container..."

                    docker create \
                        --name "${SBOM_CONTAINER}" \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        alpine:latest \
                        sh -c "sleep 300" >/dev/null

                    docker cp \
                        "${SBOM_CONTAINER}:/work/${SBOM_FILE}" \
                        "${WORKSPACE}/sbom/${SBOM_FILE}"

                    docker cp \
                        "${SBOM_CONTAINER}:/work/${GRYPE_FILE}" \
                        "${WORKSPACE}/sbom/${GRYPE_FILE}"

                    docker rm -f "${SBOM_CONTAINER}" >/dev/null

                    if [ ! -s "${WORKSPACE}/sbom/${SBOM_FILE}" ]; then
                        echo "ERROR: Backend SBOM was not copied."
                        exit 1
                    fi

                    if [ ! -s "${WORKSPACE}/sbom/${GRYPE_FILE}" ]; then
                        echo "ERROR: Backend Grype report was not copied."
                        exit 1
                    fi

                    echo "Backend SBOM:"
                    ls -lh "${WORKSPACE}/sbom/${SBOM_FILE}"

                    echo "Backend Grype report:"
                    ls -lh "${WORKSPACE}/sbom/${GRYPE_FILE}"

                    docker volume rm "${SBOM_VOLUME}" >/dev/null

                    echo "===== Backend SBOM + Grype Completed ====="
                '''
            }
        }

        stage('Push Backend to Docker Hub') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKERHUB_USERNAME',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "===== Docker Hub Login ====="

                        echo "$DOCKERHUB_TOKEN" | docker login docker.io \
                            -u "$DOCKERHUB_USERNAME" \
                            --password-stdin

                        echo "===== Backend Repository ====="
                        echo "${DOCKERHUB_BACKEND_REPOSITORY}"

                        echo "===== Tagging Backend ====="

                        docker tag \
                            ${APP_IMAGE}:${APP_VERSION} \
                            docker.io/${DOCKERHUB_BACKEND_REPOSITORY}:${APP_VERSION}

                        docker tag \
                            ${APP_IMAGE}:latest \
                            docker.io/${DOCKERHUB_BACKEND_REPOSITORY}:latest

                        echo "===== Pushing Backend Version ====="

                        docker push \
                            docker.io/${DOCKERHUB_BACKEND_REPOSITORY}:${APP_VERSION}

                        echo "===== Pushing Backend Latest ====="

                        docker push \
                            docker.io/${DOCKERHUB_BACKEND_REPOSITORY}:latest

                        echo "===== Backend Docker Hub Push Completed ====="

                        echo "Backend remote digest information:"

                        docker image inspect \
                            --format='{{json .RepoDigests}}' \
                            docker.io/${DOCKERHUB_BACKEND_REPOSITORY}:${APP_VERSION} || true
                    '''
                }
            }
        }

        stage('Cosign Sign Backend') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'cosign-private-key',
                        variable: 'COSIGN_KEY_FILE'
                    ),
                    string(
                        credentialsId: 'cosign-key-password',
                        variable: 'COSIGN_PASSWORD'
                    ),
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKERHUB_USERNAME',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "========================================"
                        echo "Cosign Backend Image Signing"
                        echo "========================================"

                        BACKEND_DIGEST=$(docker image inspect \
                            --format='{{index .RepoDigests 0}}' \
                            docker.io/${DOCKERHUB_BACKEND_REPOSITORY}:${APP_VERSION})

                        if [ -z "${BACKEND_DIGEST}" ] || [ "${BACKEND_DIGEST}" = "<no value>" ]; then
                            echo "ERROR: Could not determine backend Docker Hub digest."
                            exit 1
                        fi

                        echo "Backend image digest:"
                        echo "${BACKEND_DIGEST}"

                        set +x
                        COSIGN_PRIVATE_KEY_CONTENT="$(cat "${COSIGN_KEY_FILE}")"
                        export COSIGN_PRIVATE_KEY="${COSIGN_PRIVATE_KEY_CONTENT}"
                        unset COSIGN_PRIVATE_KEY_CONTENT
                        set -x

                        docker run --rm \
                            --user 0:0 \
                            -e COSIGN_PRIVATE_KEY \
                            -e COSIGN_PASSWORD \
                            ${COSIGN_IMAGE} \
                            sign \
                            --yes \
                            --key env://COSIGN_PRIVATE_KEY \
                            --registry-username "${DOCKERHUB_USERNAME}" \
                            --registry-password "${DOCKERHUB_TOKEN}" \
                            "${BACKEND_DIGEST}"

                        echo "===== Backend Cosign Signing Completed ====="
                    '''
                }
            }
        }

        stage('Cosign Verify Backend') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'cosign-public-key',
                        variable: 'COSIGN_PUBLIC_KEY_FILE'
                    ),
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKERHUB_USERNAME',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "========================================"
                        echo "Cosign Backend Signature Verification"
                        echo "========================================"

                        BACKEND_DIGEST=$(docker image inspect \
                            --format='{{index .RepoDigests 0}}' \
                            docker.io/${DOCKERHUB_BACKEND_REPOSITORY}:${APP_VERSION})

                        if [ -z "${BACKEND_DIGEST}" ] || [ "${BACKEND_DIGEST}" = "<no value>" ]; then
                            echo "ERROR: Could not determine backend Docker Hub digest."
                            exit 1
                        fi

                        echo "Verifying backend:"
                        echo "${BACKEND_DIGEST}"

                        export COSIGN_PUBLIC_KEY="$(cat "${COSIGN_PUBLIC_KEY_FILE}")"

                        docker run --rm \
                            --user 0:0 \
                            -e COSIGN_PUBLIC_KEY \
                            ${COSIGN_IMAGE} \
                            verify \
                            --key env://COSIGN_PUBLIC_KEY \
                            --registry-username "${DOCKERHUB_USERNAME}" \
                            --registry-password "${DOCKERHUB_TOKEN}" \
                            "${BACKEND_DIGEST}"

                        echo "===== Backend Cosign Verification Completed ====="
                    '''
                }
            }
        }

        stage('Frontend Docker Build') {
            steps {
                sh '''
                    set -e

                    echo "===== Frontend Docker Build ====="

                    docker build \
                        -t ${FRONTEND_IMAGE}:${APP_VERSION} \
                        -t ${FRONTEND_IMAGE}:latest \
                        ./frontend

                    echo "Frontend image built:"

                    docker image inspect \
                        ${FRONTEND_IMAGE}:${APP_VERSION} \
                        --format='{{.Id}}'
                '''
            }
        }

        stage('Frontend Docker Image Check') {
            steps {
                sh '''
                    set -e

                    echo "===== Frontend Docker Image Check ====="

                    docker image inspect \
                        ${FRONTEND_IMAGE}:${APP_VERSION}

                    docker images ${FRONTEND_IMAGE}
                '''
            }
        }

        stage('Frontend Trivy Scan') {
            steps {
                sh '''
                    echo "===== Frontend Trivy Security Scan ====="

                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        aquasec/trivy:latest \
                        image \
                        --severity HIGH,CRITICAL \
                        --exit-code 0 \
                        ${FRONTEND_IMAGE}:${APP_VERSION}
                '''
            }
        }

        stage('Frontend SBOM + Grype') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "Frontend SBOM + Grype"
                    echo "========================================"

                    SBOM_VOLUME="auralis-sbom-frontend-${BUILD_NUMBER}"
                    SBOM_FILE="frontend-${APP_VERSION}-sbom.json"
                    GRYPE_FILE="frontend-${APP_VERSION}-grype.json"
                    SBOM_CONTAINER="auralis-sbom-extract-frontend-${BUILD_NUMBER}"

                    docker rm -f "${SBOM_CONTAINER}" >/dev/null 2>&1 || true
                    docker volume rm "${SBOM_VOLUME}" >/dev/null 2>&1 || true
                    docker volume create "${SBOM_VOLUME}" >/dev/null

                    echo "Checking frontend image..."

                    docker image inspect \
                        "${FRONTEND_IMAGE}:${APP_VERSION}" >/dev/null

                    echo "Running Syft ${SYFT_VERSION}..."

                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        -v "${SBOM_VOLUME}:/work" \
                        ghcr.io/anchore/syft:${SYFT_VERSION} \
                        "docker:${FRONTEND_IMAGE}:${APP_VERSION}" \
                        -o "cyclonedx-json=/work/${SBOM_FILE}"

                    docker run --rm \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        alpine:latest \
                        sh -c "test -s /work/${SBOM_FILE} && ls -lh /work/${SBOM_FILE}"

                    echo "Running Grype ${GRYPE_IMAGE}..."

                    docker run --rm \
                        -v "${SBOM_VOLUME}:/work:rw" \
                        ${GRYPE_IMAGE} \
                        "sbom:/work/${SBOM_FILE}" \
                        -o json \
                        --file "/work/${GRYPE_FILE}"

                    echo "===== Frontend Grype Results ====="

                    docker run --rm \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        ${GRYPE_IMAGE} \
                        "sbom:/work/${SBOM_FILE}"

                    docker run --rm \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        alpine:latest \
                        sh -c "test -s /work/${GRYPE_FILE} && ls -lh /work/${GRYPE_FILE}"

                    echo "Creating extraction container..."

                    docker create \
                        --name "${SBOM_CONTAINER}" \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        alpine:latest \
                        sh -c "sleep 300" >/dev/null

                    docker cp \
                        "${SBOM_CONTAINER}:/work/${SBOM_FILE}" \
                        "${WORKSPACE}/sbom/${SBOM_FILE}"

                    docker cp \
                        "${SBOM_CONTAINER}:/work/${GRYPE_FILE}" \
                        "${WORKSPACE}/sbom/${GRYPE_FILE}"

                    docker rm -f "${SBOM_CONTAINER}" >/dev/null

                    if [ ! -s "${WORKSPACE}/sbom/${SBOM_FILE}" ]; then
                        echo "ERROR: Frontend SBOM was not copied."
                        docker volume rm "${SBOM_VOLUME}" >/dev/null 2>&1 || true
                        exit 1
                    fi

                    if [ ! -s "${WORKSPACE}/sbom/${GRYPE_FILE}" ]; then
                        echo "ERROR: Frontend Grype report was not copied."
                        docker volume rm "${SBOM_VOLUME}" >/dev/null 2>&1 || true
                        exit 1
                    fi

                    echo "Frontend SBOM:"
                    ls -lh "${WORKSPACE}/sbom/${SBOM_FILE}"

                    echo "Frontend Grype report:"
                    ls -lh "${WORKSPACE}/sbom/${GRYPE_FILE}"

                    docker volume rm "${SBOM_VOLUME}" >/dev/null

                    echo "===== Frontend SBOM + Grype Completed ====="
                '''
            }
        }

        stage('Push Frontend to Docker Hub') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKERHUB_USERNAME',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "===== Docker Hub Login ====="

                        echo "$DOCKERHUB_TOKEN" | docker login docker.io \
                            -u "$DOCKERHUB_USERNAME" \
                            --password-stdin

                        echo "===== Frontend Repository ====="
                        echo "${DOCKERHUB_FRONTEND_REPOSITORY}"

                        echo "===== Tagging Frontend ====="

                        docker tag \
                            ${FRONTEND_IMAGE}:${APP_VERSION} \
                            docker.io/${DOCKERHUB_FRONTEND_REPOSITORY}:${APP_VERSION}

                        docker tag \
                            ${FRONTEND_IMAGE}:latest \
                            docker.io/${DOCKERHUB_FRONTEND_REPOSITORY}:latest

                        echo "===== Pushing Frontend Version ====="

                        docker push \
                            docker.io/${DOCKERHUB_FRONTEND_REPOSITORY}:${APP_VERSION}

                        echo "===== Pushing Frontend Latest ====="

                        docker push \
                            docker.io/${DOCKERHUB_FRONTEND_REPOSITORY}:latest

                        echo "===== Frontend Docker Hub Push Completed ====="

                        echo "Frontend remote digest information:"

                        docker image inspect \
                            --format='{{json .RepoDigests}}' \
                            docker.io/${DOCKERHUB_FRONTEND_REPOSITORY}:${APP_VERSION} || true

                        docker logout docker.io
                    '''
                }
            }
        }

        stage('Cosign Sign Frontend') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'cosign-private-key',
                        variable: 'COSIGN_KEY_FILE'
                    ),
                    string(
                        credentialsId: 'cosign-key-password',
                        variable: 'COSIGN_PASSWORD'
                    ),
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKERHUB_USERNAME',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "========================================"
                        echo "Cosign Frontend Image Signing"
                        echo "========================================"

                        FRONTEND_DIGEST=$(docker image inspect \
                            --format='{{index .RepoDigests 0}}' \
                            docker.io/${DOCKERHUB_FRONTEND_REPOSITORY}:${APP_VERSION})

                        if [ -z "${FRONTEND_DIGEST}" ] || [ "${FRONTEND_DIGEST}" = "<no value>" ]; then
                            echo "ERROR: Could not determine frontend Docker Hub digest."
                            exit 1
                        fi

                        echo "Frontend image digest:"
                        echo "${FRONTEND_DIGEST}"

                        set +x
                        COSIGN_PRIVATE_KEY_CONTENT="$(cat "${COSIGN_KEY_FILE}")"
                        export COSIGN_PRIVATE_KEY="${COSIGN_PRIVATE_KEY_CONTENT}"
                        unset COSIGN_PRIVATE_KEY_CONTENT
                        set -x

                        docker run --rm \
                            --user 0:0 \
                            -e COSIGN_PRIVATE_KEY \
                            -e COSIGN_PASSWORD \
                            ${COSIGN_IMAGE} \
                            sign \
                            --yes \
                            --key env://COSIGN_PRIVATE_KEY \
                            --registry-username "${DOCKERHUB_USERNAME}" \
                            --registry-password "${DOCKERHUB_TOKEN}" \
                            "${FRONTEND_DIGEST}"

                        echo "===== Frontend Cosign Signing Completed ====="
                    '''
                }
            }
        }

        stage('Cosign Verify Frontend') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'cosign-public-key',
                        variable: 'COSIGN_PUBLIC_KEY_FILE'
                    ),
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKERHUB_USERNAME',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "========================================"
                        echo "Cosign Frontend Signature Verification"
                        echo "========================================"

                        FRONTEND_DIGEST=$(docker image inspect \
                            --format='{{index .RepoDigests 0}}' \
                            docker.io/${DOCKERHUB_FRONTEND_REPOSITORY}:${APP_VERSION})

                        if [ -z "${FRONTEND_DIGEST}" ] || [ "${FRONTEND_DIGEST}" = "<no value>" ]; then
                            echo "ERROR: Could not determine frontend Docker Hub digest."
                            exit 1
                        fi

                        echo "Verifying frontend:"
                        echo "${FRONTEND_DIGEST}"

                        export COSIGN_PUBLIC_KEY="$(cat "${COSIGN_PUBLIC_KEY_FILE}")"

                        docker run --rm \
                            --user 0:0 \
                            -e COSIGN_PUBLIC_KEY \
                            ${COSIGN_IMAGE} \
                            verify \
                            --key env://COSIGN_PUBLIC_KEY \
                            --registry-username "${DOCKERHUB_USERNAME}" \
                            --registry-password "${DOCKERHUB_TOKEN}" \
                            "${FRONTEND_DIGEST}"

                        echo "===== Frontend Cosign Verification Completed ====="
                    '''
                }
            }
        }

        stage('Create SBOM Traceability Metadata') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "SBOM Traceability Metadata"
                    echo "========================================"

                    BACKEND_IMAGE_ID=$(docker image inspect \
                        --format='{{.Id}}' \
                        ${APP_IMAGE}:${APP_VERSION} 2>/dev/null || true)

                    FRONTEND_IMAGE_ID=$(docker image inspect \
                        --format='{{.Id}}' \
                        ${FRONTEND_IMAGE}:${APP_VERSION} 2>/dev/null || true)

                    BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

                    BACKEND_DIGEST=$(docker image inspect \
                        --format='{{index .RepoDigests 0}}' \
                        docker.io/${DOCKERHUB_BACKEND_REPOSITORY}:${APP_VERSION})

                    FRONTEND_DIGEST=$(docker image inspect \
                        --format='{{index .RepoDigests 0}}' \
                        docker.io/${DOCKERHUB_FRONTEND_REPOSITORY}:${APP_VERSION})

                    cat > "sbom/traceability-${APP_VERSION}.json" <<EOF
{
  "application": "Auralis Web3 Music Streaming Platform",
  "jenkins": {
    "job": "${JOB_NAME}",
    "build_number": "${BUILD_NUMBER}",
    "build_url": "${BUILD_URL}"
  },
  "source": {
    "repository": "https://github.com/0x1k4rt1k/auralis-web3-music.git",
    "branch": "main",
    "commit_sha": "${GIT_COMMIT_SHA}",
    "commit_short_sha": "${GIT_COMMIT_SHORT}"
  },
  "build": {
    "timestamp": "${BUILD_TIMESTAMP}",
    "syft_version": "${SYFT_VERSION}",
    "grype_image": "${GRYPE_IMAGE}",
    "cosign_image": "${COSIGN_IMAGE}"
  },
  "backend": {
    "image": "docker.io/${DOCKERHUB_BACKEND_REPOSITORY}:${APP_VERSION}",
    "local_image": "${APP_IMAGE}:${APP_VERSION}",
    "image_id": "${BACKEND_IMAGE_ID}",
    "sbom": "backend-${APP_VERSION}-sbom.json",
    "grype_report": "backend-${APP_VERSION}-grype.json"
  },
  "frontend": {
    "image": "docker.io/${DOCKERHUB_FRONTEND_REPOSITORY}:${APP_VERSION}",
    "local_image": "${FRONTEND_IMAGE}:${APP_VERSION}",
    "image_id": "${FRONTEND_IMAGE_ID}",
    "sbom": "frontend-${APP_VERSION}-sbom.json",
    "grype_report": "frontend-${APP_VERSION}-grype.json"
  },
  "signing": {
    "backend": "cosign",
    "backend_digest": "${BACKEND_DIGEST}",
    "frontend": "cosign",
    "frontend_digest": "${FRONTEND_DIGEST}",
    "verification": "cosign public-key verification"
  }
}
EOF

                    echo "Traceability metadata created:"
                    cat "sbom/traceability-${APP_VERSION}.json"
                '''
            }
        }

        stage('Deploy with Docker Compose') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKERHUB_USERNAME',
                        passwordVariable: 'DOCKERHUB_PASSWORD'
                    ),
                    string(
                        credentialsId: 'auralis-postgres-password',
                        variable: 'POSTGRES_PASSWORD'
                    ),
                    string(
                        credentialsId: 'audius-api-key',
                        variable: 'AUDIUS_API_KEY'
                    ),
                    string(
                        credentialsId: 'audius-bearer-token',
                        variable: 'AUDIUS_BEARER_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "========================================"
                        echo "Docker Compose Deployment"
                        echo "========================================"

                        echo "$DOCKERHUB_PASSWORD" | docker login docker.io \
                            -u "$DOCKERHUB_USERNAME" \
                            --password-stdin

                        export BACKEND_IMAGE="docker.io/${DOCKERHUB_BACKEND_REPOSITORY}:${APP_VERSION}"
                        export FRONTEND_IMAGE="docker.io/${DOCKERHUB_FRONTEND_REPOSITORY}:${APP_VERSION}"

                        echo "Backend image:"
                        echo "${BACKEND_IMAGE}"

                        echo "Frontend image:"
                        echo "${FRONTEND_IMAGE}"

                        cat > .auralis-deploy.env <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
AUDIUS_API_KEY=${AUDIUS_API_KEY}
AUDIUS_BEARER_TOKEN=${AUDIUS_BEARER_TOKEN}
BACKEND_IMAGE=${BACKEND_IMAGE}
FRONTEND_IMAGE=${FRONTEND_IMAGE}
EOF

                        chmod 600 .auralis-deploy.env

                        echo "===== Compose Image Variables ====="

                        grep -E '^(BACKEND_IMAGE|FRONTEND_IMAGE)=' \
                            .auralis-deploy.env

                        echo "===== Docker Compose Configuration ====="

                        docker compose \
                            --env-file .auralis-deploy.env \
                            -f docker-compose.prod.yml \
                            config

                        echo "===== Pulling Production Images ====="

                        docker compose \
                            --env-file .auralis-deploy.env \
                            -f docker-compose.prod.yml \
                            pull

                        echo "===== Starting Auralis ====="

                        docker compose \
                            --env-file .auralis-deploy.env \
                            -f docker-compose.prod.yml \
                            up -d

                        echo "===== Deployment Status ====="

                        docker compose \
                            --env-file .auralis-deploy.env \
                            -f docker-compose.prod.yml \
                            ps

                        echo "===== Backend Health Check ====="

                        READY=0

                        for i in $(seq 1 30); do
                            if docker compose \
                                --env-file .auralis-deploy.env \
                                -f docker-compose.prod.yml \
                                exec -T backend \
                                node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
                            then
                                echo "Backend is healthy."
                                READY=1
                                break
                            fi

                            echo "Backend not ready yet. Attempt ${i}/30"
                            sleep 5
                        done

                        if [ "${READY}" -ne 1 ]; then
                            echo "ERROR: Backend did not become healthy."
                            docker compose \
                                --env-file .auralis-deploy.env \
                                -f docker-compose.prod.yml \
                                logs --tail=100 backend
                            exit 1
                        fi

                        echo "===== Auralis Deployment Successful ====="

                        docker compose \
                            --env-file .auralis-deploy.env \
                            -f docker-compose.prod.yml \
                            ps

                        echo "Cleaning deployment environment file..."

                        rm -f .auralis-deploy.env

                        docker logout docker.io
                    '''
                }
            }
        }

        stage('DAST - OWASP ZAP Baseline') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "OWASP ZAP DAST Baseline Scan"
                    echo "========================================"

                    echo "Target: ${DAST_TARGET}"

                    ZAP_DIR="${WORKSPACE}/zap-reports"
                    ZAP_OUTPUT="${ZAP_DIR}/output"

                    rm -rf "${ZAP_DIR}"
                    mkdir -p "${ZAP_OUTPUT}"
                    chmod 777 "${ZAP_DIR}" "${ZAP_OUTPUT}"

                    echo "Waiting for Auralis application to respond..."

                    READY=0

                    for i in $(seq 1 30); do
                        if curl -fsS "${DAST_TARGET}/api/health" >/dev/null 2>&1; then
                            echo "Auralis application is responding."
                            READY=1
                            break
                        fi

                        echo "Application not ready yet. Attempt ${i}/30"
                        sleep 10
                    done

                    if [ "${READY}" -ne 1 ]; then
                        echo "ERROR: Auralis application did not become ready."
                        exit 1
                    fi

                    echo "Pulling OWASP ZAP image..."

                    docker pull "${ZAP_IMAGE}"

                    echo "Starting OWASP ZAP baseline scan..."

                    docker run --rm \
                        --network auralis-devsecops_auralis-public \
                        --user 0:0 \
                        -v "${ZAP_DIR}:/zap/wrk:rw" \
                        -v "${ZAP_OUTPUT}:/zap/output:rw" \
                        "${ZAP_IMAGE}" \
                        zap-baseline.py \
                        -t "${DAST_TARGET}" \
                        -r /zap/output/auralis-zap-report.html \
                        -J /zap/output/auralis-zap-report.json \
                        -I

                    echo "========================================"
                    echo "OWASP ZAP Scan Completed"
                    echo "========================================"

                    echo "ZAP container output directory:"
                    ls -lah "${ZAP_OUTPUT}"

                    test -s "${ZAP_OUTPUT}/auralis-zap-report.html"
                    test -s "${ZAP_OUTPUT}/auralis-zap-report.json"

                    cp "${ZAP_OUTPUT}/auralis-zap-report.html" "${ZAP_DIR}/"
                    cp "${ZAP_OUTPUT}/auralis-zap-report.json" "${ZAP_DIR}/"

                    echo "Generated ZAP reports:"
                    ls -lah "${ZAP_DIR}"

                    test -s "${ZAP_DIR}/auralis-zap-report.html"
                    test -s "${ZAP_DIR}/auralis-zap-report.json"

                    echo "ZAP HTML report generated successfully."
                    echo "ZAP JSON report generated successfully."
                '''
            }
        }

        stage('DAST - OWASP ZAP API Scan') {
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "OWASP ZAP API DAST Scan"
                    echo "========================================"

                    ZAP_DIR="${WORKSPACE}/zap-reports"
                    API_SPEC="${ZAP_DIR}/auralis-api.yaml"
                    ZAP_API_OUTPUT="${ZAP_DIR}/api-output"

                    mkdir -p "${ZAP_DIR}" "${ZAP_API_OUTPUT}"
                    chmod 777 "${ZAP_DIR}" "${ZAP_API_OUTPUT}"

                    echo "Creating Auralis API OpenAPI definition..."

                    cat > "${API_SPEC}" <<EOF
openapi: 3.0.3
info:
  title: Auralis API
  version: 1.0.0
  description: Auralis API used for CI/CD DAST testing.

servers:
  - url: ${DAST_TARGET}

paths:

  /api/health:
    get:
      responses:
        '200':
          description: Health response

  /api/overview:
    get:
      responses:
        '200':
          description: Overview response

  /api/tracks:
    get:
      responses:
        '200':
          description: Tracks response

  /api/artists:
    get:
      responses:
        '200':
          description: Artists response

  /api/playlists:
    get:
      responses:
        '200':
          description: Playlists response

  /api/tracks/{id}/play:
    post:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Play response
        '400':
          description: Invalid request
        '404':
          description: Track not found

  /api/tracks/{id}/stream:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Audio stream response
        '302':
          description: Redirect to audio storage
        '404':
          description: Track not found

  /metrics:
    get:
      responses:
        '200':
          description: Prometheus metrics
EOF

                    echo "API specification created:"
                    ls -lh "${API_SPEC}"

                    echo "Starting OWASP ZAP API scan..."

                    docker run --rm \
                        --network auralis-devsecops_auralis-public \
                        --user 0:0 \
                        -v "${ZAP_DIR}:/zap/wrk:rw" \
                        -v "${ZAP_API_OUTPUT}:/zap/output:rw" \
                        "${ZAP_IMAGE}" \
                        zap-api-scan.py \
                        -t /zap/wrk/auralis-api.yaml \
                        -f openapi \
                        -r /zap/output/auralis-api-zap-report.html \
                        -J /zap/output/auralis-api-zap-report.json \
                        -I

                    echo "========================================"
                    echo "OWASP ZAP API Scan Completed"
                    echo "========================================"

                    echo "ZAP API container output directory:"
                    ls -lah "${ZAP_API_OUTPUT}"

                    test -s "${ZAP_API_OUTPUT}/auralis-api-zap-report.html"
                    test -s "${ZAP_API_OUTPUT}/auralis-api-zap-report.json"

                    cp "${ZAP_API_OUTPUT}/auralis-api-zap-report.html" "${ZAP_DIR}/"
                    cp "${ZAP_API_OUTPUT}/auralis-api-zap-report.json" "${ZAP_DIR}/"

                    echo "Generated API DAST reports:"
                    ls -lah "${ZAP_DIR}"

                    test -s "${ZAP_DIR}/auralis-api-zap-report.html"
                    test -s "${ZAP_DIR}/auralis-api-zap-report.json"
                '''
            }
        }
    }

    post {
        always {

            archiveArtifacts(
                artifacts: 'dependency-check-report/*',
                allowEmptyArchive: true
            )

            archiveArtifacts(
                artifacts: 'gitleaks-report/*.json',
                allowEmptyArchive: true,
                fingerprint: true
            )

            archiveArtifacts(
                artifacts: 'backend/coverage/lcov.info',
                allowEmptyArchive: true,
                fingerprint: true
            )

            archiveArtifacts(
                artifacts: 'sbom/*.json',
                allowEmptyArchive: true,
                fingerprint: true
            )

            archiveArtifacts(
                artifacts: 'zap-reports/*',
                allowEmptyArchive: true,
                fingerprint: true
            )
        }

        success {
            echo 'Auralis DevSecOps CI/CD pipeline completed successfully.'
            echo 'Docker images pushed to Docker Hub and deployed with Docker Compose.'
            echo 'SBOM traceability metadata archived.'
            echo 'Cosign signatures created and verified for backend and frontend.'
            echo 'Kubernetes/Argo CD manifests remain in GitHub as the advanced deployment path.'
        }

        failure {
            echo 'Auralis DevSecOps pipeline failed. Check the failed stage logs.'
        }
    }
}
