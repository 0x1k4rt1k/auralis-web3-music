pipeline {
    agent any

    tools {
        nodejs 'NodeJS-22'
    }

    environment {
        APP_IMAGE = 'auralis-backend'
        FRONTEND_IMAGE = 'auralis-frontend'
        APP_VERSION = "${BUILD_NUMBER}"

        OCIR_REGISTRY = 'hyd.ocir.io'
        OCIR_REPOSITORY = 'hyd.ocir.io/axedsxii3ulu/auralis'

        SYFT_VERSION = 'v1.52.0'
        GRYPE_IMAGE = 'anchore/grype:latest'
        GITLEAKS_IMAGE = 'zricethezav/gitleaks:latest'
        COSIGN_IMAGE = 'ghcr.io/sigstore/cosign/cosign:latest'
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

                    echo "Jenkins Build:"
                    echo "${BUILD_NUMBER}"

                    echo "Git Commit:"
                    echo "${GIT_COMMIT_SHA}"
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

        stage('Unit Tests') {
            steps {
                dir('backend') {
                    sh 'npm test'
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
                                    -Dsonar.token="\$SONAR_TOKEN"
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

                    mkdir -p gitleaks-report

                    docker run --rm \
                        -v "$WORKSPACE:/repo" \
                        ${GITLEAKS_IMAGE} \
                        detect \
                        --source=/repo \
                        --no-git \
                        --no-banner \
                        --redact \
                        --report-format json \
                        --report-path /repo/gitleaks-report/gitleaks.json \
                        --exit-code 1

                    GITLEAKS_EXIT=$?

                    echo "Gitleaks exit code: ${GITLEAKS_EXIT}"

                    if [ -f gitleaks-report/gitleaks.json ]; then
                        echo "Gitleaks report generated:"
                        ls -lh gitleaks-report/gitleaks.json
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
                    pattern: 'dependency-check-report/dependency-check-report.xml',
                    failedTotalCritical: 0,
                    failedTotalHigh: 0
                )
            }
        }

        stage('Backend Docker Build') {
            steps {
                sh '''
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

        stage('Push Backend to OCIR') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'ocir-credentials',
                        usernameVariable: 'OCIR_USERNAME',
                        passwordVariable: 'OCIR_TOKEN'
                    )
                ]) {
                    sh '''
                        echo "===== OCIR Login ====="

                        echo "$OCIR_TOKEN" | docker login "$OCIR_REGISTRY" \
                            -u "$OCIR_USERNAME" \
                            --password-stdin

                        echo "===== Tagging Backend ====="

                        docker tag ${APP_IMAGE}:${APP_VERSION} \
                            ${OCIR_REPOSITORY}:backend-${APP_VERSION}

                        docker tag ${APP_IMAGE}:latest \
                            ${OCIR_REPOSITORY}:backend-latest

                        echo "===== Pushing Backend Version ====="

                        docker push \
                            ${OCIR_REPOSITORY}:backend-${APP_VERSION}

                        echo "===== Pushing Backend Latest ====="

                        docker push \
                            ${OCIR_REPOSITORY}:backend-latest

                        echo "===== Backend OCIR Push Completed ====="

                        echo "Backend remote digest information:"
                        docker image inspect \
                            --format='{{json .RepoDigests}}' \
                            ${OCIR_REPOSITORY}:backend-${APP_VERSION} || true
                    '''
                }
            }
        }

        stage('Cosign Sign Backend') {
            steps {
                withCredentials([
                    file(credentialsId: 'cosign-private-key', variable: 'COSIGN_KEY_FILE'),
                    string(credentialsId: 'cosign-key-password', variable: 'COSIGN_PASSWORD'),
                    usernamePassword(
                        credentialsId: 'ocir-credentials',
                        usernameVariable: 'OCIR_USERNAME',
                        passwordVariable: 'OCIR_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "========================================"
                        echo "Cosign Backend Image Signing"
                        echo "========================================"

                        BACKEND_DIGEST=$(docker image inspect \
                            --format='{{index .RepoDigests 0}}' \
                            ${OCIR_REPOSITORY}:backend-${APP_VERSION})

                        if [ -z "${BACKEND_DIGEST}" ] || [ "${BACKEND_DIGEST}" = "<no value>" ]; then
                            echo "ERROR: Could not determine backend OCIR digest."
                            exit 1
                        fi

                        echo "Backend image digest:"
                        echo "${BACKEND_DIGEST}"

                        export COSIGN_PRIVATE_KEY="$(cat "${COSIGN_KEY_FILE}")"

                        docker run --rm \
                            --user 0:0 \
                            -e COSIGN_PRIVATE_KEY \
                            -e COSIGN_PASSWORD \
                            ${COSIGN_IMAGE} \
                            sign \
                            --yes \
                            --key env://COSIGN_PRIVATE_KEY \
                            --registry-username "${OCIR_USERNAME}" \
                            --registry-password "${OCIR_TOKEN}" \
                            "${BACKEND_DIGEST}"

                        echo "===== Backend Cosign Signing Completed ====="
                    '''
                }
            }
        }

        stage('Cosign Verify Backend') {
            steps {
                withCredentials([
                    file(credentialsId: 'cosign-public-key', variable: 'COSIGN_PUBLIC_KEY_FILE'),
                    usernamePassword(
                        credentialsId: 'ocir-credentials',
                        usernameVariable: 'OCIR_USERNAME',
                        passwordVariable: 'OCIR_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "========================================"
                        echo "Cosign Backend Signature Verification"
                        echo "========================================"

                        BACKEND_DIGEST=$(docker image inspect \
                            --format='{{index .RepoDigests 0}}' \
                            ${OCIR_REPOSITORY}:backend-${APP_VERSION})

                        if [ -z "${BACKEND_DIGEST}" ] || [ "${BACKEND_DIGEST}" = "<no value>" ]; then
                            echo "ERROR: Could not determine backend OCIR digest."
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
                            --registry-username "${OCIR_USERNAME}" \
                            --registry-password "${OCIR_TOKEN}" \
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
                    docker image inspect ${FRONTEND_IMAGE}:${APP_VERSION} \
                        --format='{{.Id}}'
                '''
            }
        }

        stage('Frontend Docker Image Check') {
            steps {
                sh '''
                    set -e
                    echo "===== Frontend Docker Image Check ====="
                    docker image inspect ${FRONTEND_IMAGE}:${APP_VERSION}
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
                    docker image inspect "${FRONTEND_IMAGE}:${APP_VERSION}" >/dev/null

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

        stage('Push Frontend to OCIR') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'ocir-credentials',
                        usernameVariable: 'OCIR_USERNAME',
                        passwordVariable: 'OCIR_TOKEN'
                    )
                ]) {
                    sh '''
                        echo "===== OCIR Login ====="

                        echo "$OCIR_TOKEN" | docker login "$OCIR_REGISTRY" \
                            -u "$OCIR_USERNAME" \
                            --password-stdin

                        echo "===== Tagging Frontend ====="

                        docker tag ${FRONTEND_IMAGE}:${APP_VERSION} \
                            ${OCIR_REPOSITORY}:frontend-${APP_VERSION}

                        docker tag ${FRONTEND_IMAGE}:latest \
                            ${OCIR_REPOSITORY}:frontend-latest

                        echo "===== Pushing Frontend Version ====="

                        docker push \
                            ${OCIR_REPOSITORY}:frontend-${APP_VERSION}

                        echo "===== Pushing Frontend Latest ====="

                        docker push \
                            ${OCIR_REPOSITORY}:frontend-latest

                        echo "===== Frontend OCIR Push Completed ====="

                        echo "Frontend remote digest information:"
                        docker image inspect \
                            --format='{{json .RepoDigests}}' \
                            ${OCIR_REPOSITORY}:frontend-${APP_VERSION} || true

                        docker logout "$OCIR_REGISTRY"
                    '''
                }
            }
        }

        stage('Cosign Sign Frontend') {
            steps {
                withCredentials([
                    file(credentialsId: 'cosign-private-key', variable: 'COSIGN_KEY_FILE'),
                    string(credentialsId: 'cosign-key-password', variable: 'COSIGN_PASSWORD'),
                    usernamePassword(
                        credentialsId: 'ocir-credentials',
                        usernameVariable: 'OCIR_USERNAME',
                        passwordVariable: 'OCIR_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "========================================"
                        echo "Cosign Frontend Image Signing"
                        echo "========================================"

                        FRONTEND_DIGEST=$(docker image inspect \
                            --format='{{index .RepoDigests 0}}' \
                            ${OCIR_REPOSITORY}:frontend-${APP_VERSION})

                        if [ -z "${FRONTEND_DIGEST}" ] || [ "${FRONTEND_DIGEST}" = "<no value>" ]; then
                            echo "ERROR: Could not determine frontend OCIR digest."
                            exit 1
                        fi

                        echo "Frontend image digest:"
                        echo "${FRONTEND_DIGEST}"

                        export COSIGN_PRIVATE_KEY="$(cat "${COSIGN_KEY_FILE}")"

                        docker run --rm \
                            --user 0:0 \
                            -e COSIGN_PRIVATE_KEY \
                            -e COSIGN_PASSWORD \
                            ${COSIGN_IMAGE} \
                            sign \
                            --yes \
                            --key env://COSIGN_PRIVATE_KEY \
                            --registry-username "${OCIR_USERNAME}" \
                            --registry-password "${OCIR_TOKEN}" \
                            "${FRONTEND_DIGEST}"

                        echo "===== Frontend Cosign Signing Completed ====="
                    '''
                }
            }
        }

        stage('Cosign Verify Frontend') {
            steps {
                withCredentials([
                    file(credentialsId: 'cosign-public-key', variable: 'COSIGN_PUBLIC_KEY_FILE'),
                    usernamePassword(
                        credentialsId: 'ocir-credentials',
                        usernameVariable: 'OCIR_USERNAME',
                        passwordVariable: 'OCIR_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "========================================"
                        echo "Cosign Frontend Signature Verification"
                        echo "========================================"

                        FRONTEND_DIGEST=$(docker image inspect \
                            --format='{{index .RepoDigests 0}}' \
                            ${OCIR_REPOSITORY}:frontend-${APP_VERSION})

                        if [ -z "${FRONTEND_DIGEST}" ] || [ "${FRONTEND_DIGEST}" = "<no value>" ]; then
                            echo "ERROR: Could not determine frontend OCIR digest."
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
                            --registry-username "${OCIR_USERNAME}" \
                            --registry-password "${OCIR_TOKEN}" \
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
                    echo "Creating traceability after both images are pushed and Cosign-verified."

                    BACKEND_IMAGE_ID=$(docker image inspect \
                        --format='{{.Id}}' \
                        ${APP_IMAGE}:${APP_VERSION} 2>/dev/null || true)

                    FRONTEND_IMAGE_ID=$(docker image inspect \
                        --format='{{.Id}}' \
                        ${FRONTEND_IMAGE}:${APP_VERSION} 2>/dev/null || true)

                    BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

                    BACKEND_DIGEST=$(docker image inspect                         --format='{{index .RepoDigests 0}}'                         ${OCIR_REPOSITORY}:backend-${APP_VERSION})

                    FRONTEND_DIGEST=$(docker image inspect                         --format='{{index .RepoDigests 0}}'                         ${OCIR_REPOSITORY}:frontend-${APP_VERSION})

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
    "image": "${OCIR_REPOSITORY}:backend-${APP_VERSION}",
    "local_image": "${APP_IMAGE}:${APP_VERSION}",
    "image_id": "${BACKEND_IMAGE_ID}",
    "sbom": "backend-${APP_VERSION}-sbom.json",
    "grype_report": "backend-${APP_VERSION}-grype.json"
  },
  "frontend": {
    "image": "${OCIR_REPOSITORY}:frontend-${APP_VERSION}",
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

        stage('Update GitOps Manifests') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'github-gitops',
                        usernameVariable: 'GIT_USERNAME',
                        passwordVariable: 'GIT_TOKEN'
                    )
                ]) {
                    sh '''
                        echo "===== Updating GitOps Manifests ====="

                        echo "Current backend image:"
                        grep "image:" k8s/backend.yaml

                        echo "Current frontend image:"
                        grep "image:" k8s/frontend.yaml

                        echo "Updating backend image to build ${APP_VERSION}"

                        sed -i \
                            "s#image: hyd.ocir.io/axedsxii3ulu/auralis:backend-[^[:space:]]*#image: hyd.ocir.io/axedsxii3ulu/auralis:backend-${APP_VERSION}#" \
                            k8s/backend.yaml

                        echo "Updating frontend image to build ${APP_VERSION}"

                        sed -i \
                            "s#image: hyd.ocir.io/axedsxii3ulu/auralis:frontend-[^[:space:]]*#image: hyd.ocir.io/axedsxii3ulu/auralis:frontend-${APP_VERSION}#" \
                            k8s/frontend.yaml

                        echo "Updated backend image:"
                        grep "image:" k8s/backend.yaml

                        echo "Updated frontend image:"
                        grep "image:" k8s/frontend.yaml

                        git config user.name "Jenkins"
                        git config user.email "jenkins@auralis.local"

                        git add k8s/backend.yaml k8s/frontend.yaml

                        if git diff --cached --quiet; then
                            echo "No GitOps changes detected."
                            exit 0
                        fi

                        git commit \
                            -m "Update Auralis images to build ${APP_VERSION} [skip ci]"

                        echo "===== Pushing GitOps Changes ====="

                        git push \
                            "https://${GIT_USERNAME}:${GIT_TOKEN}@github.com/0x1k4rt1k/auralis-web3-music.git" \
                            HEAD:main

                        echo "===== GitOps Update Completed ====="
                    '''
                }
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
                artifacts: 'sbom/*.json',
                allowEmptyArchive: true,
                fingerprint: true
            )
        }

        success {
            echo 'Auralis DevSecOps CI/CD pipeline completed successfully.'
            echo 'Docker images pushed to OCIR and GitOps manifests updated.'
            echo 'SBOM traceability metadata archived.'
            echo 'Cosign signatures created and verified for backend and frontend.'
            echo 'Argo CD will synchronize the new image versions to OKE.'
        }

        failure {
            echo 'Auralis DevSecOps pipeline failed. Check the failed stage logs.'
        }
    }
}
