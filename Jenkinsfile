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
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
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
                    echo "===== Gitleaks Secret Scan ====="

                    docker run --rm \
                        -v "$WORKSPACE:/repo:ro" \
                        zricethezav/gitleaks:latest \
                        detect \
                        --source=/repo \
                        --no-banner \
                        --exit-code 1
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

        stage('Backend SBOM') {
            steps {
                sh '''
                    set -e

                    echo "===== Backend SBOM Generation ====="

                    SBOM_VOLUME="auralis-sbom-backend-${BUILD_NUMBER}"
                    SBOM_FILE="backend-${APP_VERSION}-sbom.json"
                    SBOM_CONTAINER="auralis-sbom-extract-backend-${BUILD_NUMBER}"

                    docker rm -f "${SBOM_CONTAINER}" >/dev/null 2>&1 || true
                    docker volume rm "${SBOM_VOLUME}" >/dev/null 2>&1 || true
                    docker volume create "${SBOM_VOLUME}" >/dev/null

                    echo "Checking backend image..."
                    docker image inspect "${APP_IMAGE}:${APP_VERSION}" >/dev/null

                    echo "Running Syft ${SYFT_VERSION}..."

                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        -v "${SBOM_VOLUME}:/work" \
                        ghcr.io/anchore/syft:${SYFT_VERSION} \
                        "docker:${APP_IMAGE}:${APP_VERSION}" \
                        -o "cyclonedx-json=/work/${SBOM_FILE}"

                    echo "Validating SBOM inside Docker volume..."

                    docker run --rm \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        alpine:latest \
                        sh -c "test -s /work/${SBOM_FILE} && ls -lh /work/${SBOM_FILE}"

                    echo "Creating extraction container..."

                    docker create \
                        --name "${SBOM_CONTAINER}" \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        alpine:latest \
                        sh -c "sleep 300" >/dev/null

                    echo "Copying SBOM using docker cp..."

                    docker cp \
                        "${SBOM_CONTAINER}:/work/${SBOM_FILE}" \
                        "${WORKSPACE}/sbom/${SBOM_FILE}"

                    docker rm -f "${SBOM_CONTAINER}" >/dev/null

                    echo "Checking Jenkins workspace SBOM..."

                    if [ ! -s "${WORKSPACE}/sbom/${SBOM_FILE}" ]; then
                        echo "ERROR: Backend SBOM was not copied to Jenkins workspace."
                        ls -lah "${WORKSPACE}/sbom"
                        docker volume rm "${SBOM_VOLUME}" >/dev/null 2>&1 || true
                        exit 1
                    fi

                    echo "Backend SBOM generated successfully:"
                    ls -lh "${WORKSPACE}/sbom/${SBOM_FILE}"

                    docker volume rm "${SBOM_VOLUME}" >/dev/null
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
                    '''
                }
            }
        }

        stage('Frontend Docker Build') {
            steps {
                sh '''
                    echo "===== Frontend Docker Build ====="

                    docker build \
                        -t ${FRONTEND_IMAGE}:${APP_VERSION} \
                        -t ${FRONTEND_IMAGE}:latest \
                        ./frontend
                '''
            }
        }

        stage('Frontend Docker Image Check') {
            steps {
                sh '''
                    echo "===== Frontend Docker Image Check ====="
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

        stage('Frontend SBOM') {
            steps {
                sh '''
                    set -e

                    echo "===== Frontend SBOM Generation ====="

                    SBOM_VOLUME="auralis-sbom-frontend-${BUILD_NUMBER}"
                    SBOM_FILE="frontend-${APP_VERSION}-sbom.json"
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

                    echo "Validating SBOM inside Docker volume..."

                    docker run --rm \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        alpine:latest \
                        sh -c "test -s /work/${SBOM_FILE} && ls -lh /work/${SBOM_FILE}"

                    echo "Creating extraction container..."

                    docker create \
                        --name "${SBOM_CONTAINER}" \
                        -v "${SBOM_VOLUME}:/work:ro" \
                        alpine:latest \
                        sh -c "sleep 300" >/dev/null

                    echo "Copying SBOM using docker cp..."

                    docker cp \
                        "${SBOM_CONTAINER}:/work/${SBOM_FILE}" \
                        "${WORKSPACE}/sbom/${SBOM_FILE}"

                    docker rm -f "${SBOM_CONTAINER}" >/dev/null

                    echo "Checking Jenkins workspace SBOM..."

                    if [ ! -s "${WORKSPACE}/sbom/${SBOM_FILE}" ]; then
                        echo "ERROR: Frontend SBOM was not copied to Jenkins workspace."
                        ls -lah "${WORKSPACE}/sbom"
                        docker volume rm "${SBOM_VOLUME}" >/dev/null 2>&1 || true
                        exit 1
                    fi

                    echo "Frontend SBOM generated successfully:"
                    ls -lh "${WORKSPACE}/sbom/${SBOM_FILE}"

                    docker volume rm "${SBOM_VOLUME}" >/dev/null
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

                        docker logout "$OCIR_REGISTRY"
                    '''
                }
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
                artifacts: 'sbom/*.json',
                allowEmptyArchive: true,
                fingerprint: true
            )
        }

        success {
            echo 'Auralis DevSecOps CI/CD pipeline completed successfully.'
            echo 'Docker images pushed to OCIR and GitOps manifests updated.'
            echo 'Argo CD will synchronize the new image versions to OKE.'
        }

        failure {
            echo 'Auralis DevSecOps pipeline failed. Check the failed stage logs.'
        }
    }
}
