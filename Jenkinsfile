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
        ZAP_IMAGE = 'ghcr.io/zaproxy/zaproxy:stable'
        KICS_IMAGE = 'checkmarx/kics:v2.2.0'
        DAST_TARGET = 'http://129.154.36.20'

        BACKEND_CHANGED = 'false'
        FRONTEND_CHANGED = 'false'
        DATABASE_CHANGED = 'false'
        K8S_CHANGED = 'false'
        SECURITY_CHANGED = 'false'
        JENKINS_CHANGED = 'false'
        FULL_PIPELINE = 'false'
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

        stage('Detect Changed Files') {
    steps {
        script {
            echo '========================================'
            echo 'DETECTING CHANGED FILES'
            echo '========================================'

            def previousCommit = sh(
                script: 'git rev-parse HEAD^ 2>/dev/null || true',
                returnStdout: true
            ).trim()

            if (!previousCommit) {

                echo 'No previous commit available.'
                echo 'Running FULL PIPELINE.'

                env.BACKEND_CHANGED = 'true'
                env.FRONTEND_CHANGED = 'true'
                env.DATABASE_CHANGED = 'true'
                env.K8S_CHANGED = 'true'
                env.SECURITY_CHANGED = 'true'
                env.JENKINS_CHANGED = 'true'
                env.FULL_PIPELINE = 'true'

            } else {

                def changedFiles = sh(
                    script: """
                        git diff --name-only ${previousCommit} HEAD
                    """,
                    returnStdout: true
                ).trim()

                echo '========================================'
                echo 'Changed Files'
                echo '========================================'

                echo changedFiles ?: 'No changed files detected.'

                def files = changedFiles
                    ? changedFiles.readLines()
                        .collect { it.trim() }
                        .findAll { it }
                    : []

                def backendChanged = false
                def frontendChanged = false
                def databaseChanged = false
                def k8sChanged = false
                def securityChanged = false
                def jenkinsChanged = false

                files.each { file ->

                    if (file.startsWith('backend/')) {
                        backendChanged = true
                    }

                    if (file.startsWith('frontend/')) {
                        frontendChanged = true
                    }

                    if (file.startsWith('database/')) {
                        databaseChanged = true
                    }

                    if (file.startsWith('k8s/')) {
                        k8sChanged = true
                    }

                    if (
                        file == 'Jenkinsfile' ||
                        file.startsWith('Jenkinsfile.')
                    ) {
                        jenkinsChanged = true
                    }

                    if (
                        file == 'sonar-project.properties' ||
                        file.startsWith('.gitleaks') ||
                        file.startsWith('.github/') ||
                        file.contains('Dockerfile') ||
                        file.startsWith('docker-compose')
                    ) {
                        securityChanged = true
                    }
                }

                env.BACKEND_CHANGED =
                    backendChanged ? 'true' : 'false'

                env.FRONTEND_CHANGED =
                    frontendChanged ? 'true' : 'false'

                env.DATABASE_CHANGED =
                    databaseChanged ? 'true' : 'false'

                env.K8S_CHANGED =
                    k8sChanged ? 'true' : 'false'

                env.SECURITY_CHANGED =
                    securityChanged ? 'true' : 'false'

                env.JENKINS_CHANGED =
                    jenkinsChanged ? 'true' : 'false'

                env.FULL_PIPELINE =
                    (jenkinsChanged || securityChanged) ?
                    'true' : 'false'

                echo '========================================'
                echo 'CHANGE DETECTION RESULTS'
                echo '========================================'
                echo "Backend changed:  ${env.BACKEND_CHANGED}"
                echo "Frontend changed: ${env.FRONTEND_CHANGED}"
                echo "Database changed: ${env.DATABASE_CHANGED}"
                echo "K8s changed:      ${env.K8S_CHANGED}"
                echo "Security changed: ${env.SECURITY_CHANGED}"
                echo "Jenkins changed:  ${env.JENKINS_CHANGED}"
                echo "Full pipeline:    ${env.FULL_PIPELINE}"
                echo '========================================'
            }
        }
    }
}

        stage('Kubernetes IaC Security - KICS') {
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.K8S_CHANGED == 'true'
                }
            }
            steps {
                sh '''
                    set +e

                    echo "========================================"
                    echo "Kubernetes IaC Security - KICS"
                    echo "========================================"

                    KICS_DIR="${WORKSPACE}/kics-report"

                    rm -rf "${KICS_DIR}"
                    mkdir -p "${KICS_DIR}"
                    chmod 777 "${KICS_DIR}"

                    echo "Pulling KICS image: ${KICS_IMAGE}"
                    docker pull "${KICS_IMAGE}"

                    echo "Scanning Kubernetes manifests under ./k8s"

                    docker run --rm \
                        --user 0:0 \
                        -v "${WORKSPACE}/k8s:/k8s:ro" \
                        -v "${KICS_DIR}:/reports:rw" \
                        "${KICS_IMAGE}" \
                        scan \
                        -p /k8s \
                        -o /reports \
                        --report-formats "json,html,sarif" \
                        --output-name auralis-kics \
                        --ignore-on-exit results

                    KICS_EXIT=$?

                    echo "KICS exit code: ${KICS_EXIT}"

                    echo "Generated KICS reports:"
                    ls -lah "${KICS_DIR}"

                    if [ -s "${KICS_DIR}/auralis-kics.json" ]; then
                        echo "===== KICS JSON Results ====="
                        cat "${KICS_DIR}/auralis-kics.json"
                    else
                        echo "WARNING: KICS JSON report was not generated."
                    fi

                    if [ "${KICS_EXIT}" -ne 0 ]; then
                        echo "ERROR: KICS engine execution failed."
                        exit "${KICS_EXIT}"
                    fi

                    echo "KICS is currently REPORT-ONLY for security findings."
                    echo "Security findings will be reviewed before enabling a hard gate."

                    exit 0
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
            steps {
                dir('backend') {
                    sh 'npm ci'
                }
            }
        }

        stage('Unit Tests + Coverage') {
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
            steps {
                dir('backend') {
                    sh 'npm run lint'
                }
            }
        }

        stage('SonarQube SAST') {
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
            steps {
                dependencyCheckPublisher(
                    pattern: 'dependency-check-report/dependency-check-report.xml'
                )
            }
        }

        stage('Backend Docker Build') {
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
                            --registry-username "${OCIR_USERNAME}" \
                            --registry-password "${OCIR_TOKEN}" \
                            "${BACKEND_DIGEST}"

                        echo "===== Backend Cosign Signing Completed ====="
                    '''
                }
            }
        }

        stage('Cosign Verify Backend') {
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.FRONTEND_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.FRONTEND_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.FRONTEND_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.FRONTEND_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.FRONTEND_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.FRONTEND_CHANGED == 'true'
                }
            }
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
                            --registry-username "${OCIR_USERNAME}" \
                            --registry-password "${OCIR_TOKEN}" \
                            "${FRONTEND_DIGEST}"

                        echo "===== Frontend Cosign Signing Completed ====="
                    '''
                }
            }
        }

        stage('Cosign Verify Frontend') {
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.FRONTEND_CHANGED == 'true'
                }
            }
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.FRONTEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true'
                }
            }
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "SBOM Traceability Metadata"
                    echo "========================================"
                    echo "Creating traceability only for images built in this pipeline."

                    BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

                    BACKEND_IMAGE_ID=""
                    BACKEND_DIGEST=""
                    FRONTEND_IMAGE_ID=""
                    FRONTEND_DIGEST=""
                    BACKEND_PROCESSED=false
                    FRONTEND_PROCESSED=false

                    if [ "${FULL_PIPELINE}" = "true" ] || \
                       [ "${BACKEND_CHANGED}" = "true" ] || \
                       [ "${DATABASE_CHANGED}" = "true" ]; then

                        BACKEND_PROCESSED=true

                        BACKEND_IMAGE_ID=$(docker image inspect \
                            --format='{{.Id}}' \
                            ${APP_IMAGE}:${APP_VERSION} 2>/dev/null || true)

                        BACKEND_DIGEST=$(docker image inspect \
                            --format='{{index .RepoDigests 0}}' \
                            ${OCIR_REPOSITORY}:backend-${APP_VERSION} 2>/dev/null || true)
                    fi

                    if [ "${FULL_PIPELINE}" = "true" ] || \
                       [ "${FRONTEND_CHANGED}" = "true" ]; then

                        FRONTEND_PROCESSED=true

                        FRONTEND_IMAGE_ID=$(docker image inspect \
                            --format='{{.Id}}' \
                            ${FRONTEND_IMAGE}:${APP_VERSION} 2>/dev/null || true)

                        FRONTEND_DIGEST=$(docker image inspect \
                            --format='{{index .RepoDigests 0}}' \
                            ${OCIR_REPOSITORY}:frontend-${APP_VERSION} 2>/dev/null || true)
                    fi

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
    "processed": ${BACKEND_PROCESSED},
    "image": "${OCIR_REPOSITORY}:backend-${APP_VERSION}",
    "local_image": "${APP_IMAGE}:${APP_VERSION}",
    "image_id": "${BACKEND_IMAGE_ID}",
    "digest": "${BACKEND_DIGEST}",
    "sbom": "backend-${APP_VERSION}-sbom.json",
    "grype_report": "backend-${APP_VERSION}-grype.json"
  },
  "frontend": {
    "processed": ${FRONTEND_PROCESSED},
    "image": "${OCIR_REPOSITORY}:frontend-${APP_VERSION}",
    "local_image": "${FRONTEND_IMAGE}:${APP_VERSION}",
    "image_id": "${FRONTEND_IMAGE_ID}",
    "digest": "${FRONTEND_DIGEST}",
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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.FRONTEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true' ||
                    env.K8S_CHANGED == 'true'
                }
            }
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'github-gitops',
                        usernameVariable: 'GIT_USERNAME',
                        passwordVariable: 'GIT_TOKEN'
                    )
                ]) {
                    sh '''
                        set -e

                        echo "===== Updating GitOps Manifests ====="

                        echo "Current backend image:"
                        grep "image:" k8s/backend.yaml

                        echo "Current frontend image:"
                        grep "image:" k8s/frontend.yaml

                        # Only update the manifest for an image that was
                        # actually built and pushed in this pipeline.
                        if [ "${FULL_PIPELINE}" = "true" ] || \
                           [ "${BACKEND_CHANGED}" = "true" ] || \
                           [ "${DATABASE_CHANGED}" = "true" ]; then

                            echo "Updating backend image to build ${APP_VERSION}"

                            sed -i \
                                "s#image: hyd.ocir.io/axedsxii3ulu/auralis:backend-[^[:space:]]*#image: hyd.ocir.io/axedsxii3ulu/auralis:backend-${APP_VERSION}#" \
                                k8s/backend.yaml
                        else
                            echo "Backend image unchanged."
                        fi

                        if [ "${FULL_PIPELINE}" = "true" ] || \
                           [ "${FRONTEND_CHANGED}" = "true" ]; then

                            echo "Updating frontend image to build ${APP_VERSION}"

                            sed -i \
                                "s#image: hyd.ocir.io/axedsxii3ulu/auralis:frontend-[^[:space:]]*#image: hyd.ocir.io/axedsxii3ulu/auralis:frontend-${APP_VERSION}#" \
                                k8s/frontend.yaml
                        else
                            echo "Frontend image unchanged."
                        fi

                        echo "Updated backend image:"
                        grep "image:" k8s/backend.yaml

                        echo "Updated frontend image:"
                        grep "image:" k8s/frontend.yaml

                        git config user.name "Jenkins"
                        git config user.email "jenkins@auralis.local"

                        git add k8s/backend.yaml k8s/frontend.yaml

                        if git diff --cached --quiet; then
                            echo "No GitOps image changes detected."
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


stage('DAST - OWASP ZAP Baseline') {
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.FRONTEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true' ||
                    env.K8S_CHANGED == 'true'
                }
            }
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "OWASP ZAP DAST Baseline Scan"
                    echo "========================================"
                    echo "Target: ${DAST_TARGET}"
                    echo "========================================"

                    ZAP_DIR="${WORKSPACE}/zap-reports"

                    rm -rf "${ZAP_DIR}"
                    mkdir -p "${ZAP_DIR}"

                    # The ZAP container must be able to write reports
                    # into the Jenkins workspace bind mount.
                    chmod 777 "${ZAP_DIR}"

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

                    docker run --rm                         --user 0:0                         -v "${ZAP_DIR}:/zap/wrk:rw"                         "${ZAP_IMAGE}"                         zap-baseline.py                         -t "${DAST_TARGET}"                         -r auralis-zap-report.html                         -J auralis-zap-report.json                         -I

                    echo "========================================"
                    echo "OWASP ZAP Scan Completed"
                    echo "========================================"

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
            when {
                expression {
                    env.FULL_PIPELINE == 'true' ||
                    env.BACKEND_CHANGED == 'true' ||
                    env.FRONTEND_CHANGED == 'true' ||
                    env.DATABASE_CHANGED == 'true' ||
                    env.K8S_CHANGED == 'true'
                }
            }
            steps {
                sh '''
                    set -e

                    echo "========================================"
                    echo "OWASP ZAP API DAST Scan"
                    echo "========================================"

                    ZAP_DIR="${WORKSPACE}/zap-reports"
                    API_SPEC="${ZAP_DIR}/auralis-api.yaml"

                    mkdir -p "${ZAP_DIR}"
                    chmod 777 "${ZAP_DIR}"

                    echo "Creating Auralis API OpenAPI definition..."

                    cat > "${API_SPEC}" <<'EOF'
openapi: 3.0.3
info:
  title: Auralis API
  version: 1.0.0
  description: Auralis API used for CI/CD DAST testing.
servers:
  - url: http://129.154.36.20
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
                        --user 0:0 \
                        -v "${ZAP_DIR}:/zap/wrk:rw" \
                        "${ZAP_IMAGE}" \
                        zap-api-scan.py \
                        -t /zap/wrk/auralis-api.yaml \
                        -f openapi \
                        -r auralis-api-zap-report.html \
                        -J auralis-api-zap-report.json \
                        -I

                    echo "========================================"
                    echo "OWASP ZAP API Scan Completed"
                    echo "========================================"

                    test -s "${ZAP_DIR}/auralis-api-zap-report.html"
                    test -s "${ZAP_DIR}/auralis-api-zap-report.json"

                    echo "Generated API DAST reports:"
                    ls -lah "${ZAP_DIR}"
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

            archiveArtifacts(
                artifacts: 'kics-report/*',
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
