pipeline {

    agent any

    tools {
        nodejs 'NodeJS-22'
    }

    environment {

        // Application
        APP_VERSION = "${BUILD_NUMBER}"

        BACKEND_IMAGE = "auralis-backend"
        FRONTEND_IMAGE = "auralis-frontend"

        // OCIR
        OCIR_REGISTRY = "hyd.ocir.io"
        OCIR_REPOSITORY = "hyd.ocir.io/axedsxii3ulu/auralis"

        // Syft
        SYFT_VERSION = "v1.52.0"
        SBOM_DIR = "sbom"
    }

    stages {

        // ============================================================
        // CHECKOUT
        // ============================================================

        stage('Checkout') {
            steps {
                checkout scm
            }
        }


        // ============================================================
        // ENVIRONMENT CHECK
        // ============================================================

        stage('Environment Check') {
            steps {
                sh '''
                    echo "======================================"
                    echo "Environment Information"
                    echo "======================================"

                    echo "Node:"
                    node --version

                    echo "NPM:"
                    npm --version

                    echo "Git:"
                    git --version

                    echo "Docker:"
                    docker --version

                    echo "Build Number:"
                    echo "${BUILD_NUMBER}"

                    echo "Application Version:"
                    echo "${APP_VERSION}"

                    echo "======================================"
                '''
            }
        }


        // ============================================================
        // INSTALL DEPENDENCIES
        // ============================================================

        stage('Install Dependencies') {
            steps {
                dir('backend') {
                    sh '''
                        set -e

                        echo "Installing backend dependencies..."

                        npm ci

                        echo "Backend dependencies installed successfully."
                    '''
                }
            }
        }


        // ============================================================
        // UNIT TESTS
        // ============================================================

        stage('Unit Tests') {
            steps {
                dir('backend') {
                    sh '''
                        set -e

                        echo "Running unit tests..."

                        npm test

                        echo "Unit tests completed successfully."
                    '''
                }
            }
        }


        // ============================================================
        // ESLINT
        // ============================================================

        stage('ESLint') {
            steps {
                dir('backend') {
                    sh '''
                        set -e

                        echo "Running ESLint..."

                        npm run lint

                        echo "ESLint completed successfully."
                    '''
                }
            }
        }


        // ============================================================
        // SONARQUBE SAST
        // ============================================================

        stage('SonarQube SAST') {
            steps {

                script {

                    def scannerHome = tool 'SonarScanner'

                    withSonarQubeEnv('SonarQube') {

                        withCredentials([
                            string(
                                credentialsId: 'sonar-token',
                                variable: 'SONAR_TOKEN'
                            )
                        ]) {

                            sh """
                                set -e

                                echo "Running SonarQube SAST..."

                                ${scannerHome}/bin/sonar-scanner \
                                  -Dsonar.projectKey=auralis-web3-music \
                                  -Dsonar.projectName=auralis-web3-music \
                                  -Dsonar.sources=backend \
                                  -Dsonar.host.url=\${SONAR_HOST_URL} \
                                  -Dsonar.token=\${SONAR_TOKEN}

                                echo "SonarQube analysis completed."
                            """
                        }
                    }
                }
            }
        }


        // ============================================================
        // SONARQUBE QUALITY GATE
        // ============================================================

        stage('SonarQube Quality Gate') {
            steps {

                timeout(time: 10, unit: 'MINUTES') {

                    waitForQualityGate abortPipeline: false
                }
            }
        }


        // ============================================================
        // GITLEAKS
        // ============================================================

        stage('Gitleaks') {
            steps {

                sh '''
                    set -e

                    echo "Running Gitleaks..."

                    docker run --rm \
                      -v "${WORKSPACE}:/path" \
                      zricethezav/gitleaks:latest \
                      detect \
                      --source=/path \
                      --no-banner

                    echo "Gitleaks completed successfully."
                '''
            }
        }


        // ============================================================
        // OWASP DEPENDENCY CHECK
        // ============================================================

        stage('OWASP Dependency-Check') {
            steps {

                script {

                    withCredentials([
                        string(
                            credentialsId: 'nvd-api-key',
                            variable: 'NVD_API_KEY'
                        )
                    ]) {

                        dependencyCheck(
                            odcInstallation: 'OWASP-Dependency-Check',
                            additionalArguments: """
                                --nvdApiKey ${NVD_API_KEY}
                                --scan backend
                                --format XML
                                --format HTML
                                --out dependency-check-report
                            """
                        )
                    }
                }
            }

            post {
                always {

                    dependencyCheckPublisher(
                        pattern: 'dependency-check-report/dependency-check-report.xml',
                        failedTotalCritical: 0,
                        failedTotalHigh: 0,
                        stopBuild: false
                    )

                    archiveArtifacts(
                        artifacts: 'dependency-check-report/*',
                        allowEmptyArchive: true,
                        fingerprint: true
                    )
                }
            }
        }


        // ============================================================
        // DEPENDENCY SECURITY GATE
        // ============================================================

        stage('Dependency Security Gate') {
            steps {

                sh '''
                    set -e

                    echo "Checking Dependency-Check report..."

                    if [ ! -f dependency-check-report/dependency-check-report.xml ]; then
                        echo "Dependency-Check report not found."
                        exit 1
                    fi

                    echo "Dependency-Check report found."
                '''
            }
        }


        // ============================================================
        // BACKEND DOCKER BUILD
        // ============================================================

        stage('Backend Docker Build') {
            steps {

                sh '''
                    set -e

                    echo "Building backend Docker image..."

                    docker build \
                      -t ${BACKEND_IMAGE}:${APP_VERSION} \
                      -t ${BACKEND_IMAGE}:latest \
                      ./backend

                    echo "Backend image built successfully."

                    docker images ${BACKEND_IMAGE}
                '''
            }
        }


        // ============================================================
        // BACKEND DOCKER IMAGE CHECK
        // ============================================================

        stage('Backend Docker Image Check') {
            steps {

                sh '''
                    set -e

                    echo "Checking backend Docker image..."

                    docker image inspect ${BACKEND_IMAGE}:${APP_VERSION}

                    echo "Backend Docker image exists."
                '''
            }
        }


        // ============================================================
        // BACKEND SBOM - SYFT
        // ============================================================

        stage('Backend SBOM') {
            steps {
                sh '''
                    set -e

                    echo "======================================"
                    echo "Generating Backend SBOM"
                    echo "======================================"

                    mkdir -p "${WORKSPACE}/sbom"

                    echo "Checking backend image..."
                    docker image inspect ${BACKEND_IMAGE}:${APP_VERSION} >/dev/null

                    echo "Creating temporary SBOM volume..."

                    docker volume create auralis-sbom-output >/dev/null

                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        -v auralis-sbom-output:/work \
                        ghcr.io/anchore/syft:${SYFT_VERSION} \
                        "docker:${BACKEND_IMAGE}:${APP_VERSION}" \
                        -o "cyclonedx-json=/work/backend-${APP_VERSION}-sbom.json"

                    echo "Copying SBOM from Docker volume..."

                    docker run --rm \
                        -v auralis-sbom-output:/work \
                        -v "${WORKSPACE}/sbom:/output" \
                        alpine:latest \
                        cp "/work/backend-${APP_VERSION}-sbom.json" \
                        "/output/backend-${APP_VERSION}-sbom.json"

                    docker volume rm auralis-sbom-output >/dev/null

                    echo "Checking generated SBOM..."

                    test -s "${WORKSPACE}/sbom/backend-${APP_VERSION}-sbom.json"

                    echo "Backend SBOM generated successfully."

                    ls -lh "${WORKSPACE}/sbom/backend-${APP_VERSION}-sbom.json"
                '''
            }
        }


        // ============================================================
        // BACKEND TRIVY
        // ============================================================

        stage('Backend Trivy Scan') {
            steps {

                sh '''
                    echo "Running Trivy backend image scan..."

                    docker run --rm \
                      -v /var/run/docker.sock:/var/run/docker.sock \
                      aquasec/trivy:latest \
                      image \
                      --severity HIGH,CRITICAL \
                      --exit-code 0 \
                      ${BACKEND_IMAGE}:${APP_VERSION}

                    echo "Backend Trivy scan completed."
                '''
            }
        }


        // ============================================================
        // FRONTEND DOCKER BUILD
        // ============================================================

        stage('Frontend Docker Build') {
            steps {

                sh '''
                    set -e

                    echo "Building frontend Docker image..."

                    docker build \
                      -t ${FRONTEND_IMAGE}:${APP_VERSION} \
                      -t ${FRONTEND_IMAGE}:latest \
                      ./frontend

                    echo "Frontend image built successfully."

                    docker images ${FRONTEND_IMAGE}
                '''
            }
        }


        // ============================================================
        // FRONTEND DOCKER IMAGE CHECK
        // ============================================================

        stage('Frontend Docker Image Check') {
            steps {

                sh '''
                    set -e

                    echo "Checking frontend Docker image..."

                    docker image inspect ${FRONTEND_IMAGE}:${APP_VERSION}

                    echo "Frontend Docker image exists."
                '''
            }
        }


        // ============================================================
        // FRONTEND SBOM - SYFT
        // ============================================================

        stage('Frontend SBOM') {
            steps {
                sh '''
                    set -e

                    echo "======================================"
                    echo "Generating Frontend SBOM"
                    echo "======================================"

                    mkdir -p "${WORKSPACE}/sbom"

                    echo "Checking frontend image..."
                    docker image inspect ${FRONTEND_IMAGE}:${APP_VERSION} >/dev/null

                    echo "Creating temporary SBOM volume..."

                    docker volume create auralis-frontend-sbom-output >/dev/null

                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        -v auralis-frontend-sbom-output:/work \
                        ghcr.io/anchore/syft:${SYFT_VERSION} \
                        "docker:${FRONTEND_IMAGE}:${APP_VERSION}" \
                        -o "cyclonedx-json=/work/frontend-${APP_VERSION}-sbom.json"

                    echo "Copying SBOM from Docker volume..."

                    docker run --rm \
                        -v auralis-frontend-sbom-output:/work \
                        -v "${WORKSPACE}/sbom:/output" \
                        alpine:latest \
                        cp "/work/frontend-${APP_VERSION}-sbom.json" \
                        "/output/frontend-${APP_VERSION}-sbom.json"

                    docker volume rm auralis-frontend-sbom-output >/dev/null

                    echo "Checking generated SBOM..."

                    test -s "${WORKSPACE}/sbom/frontend-${APP_VERSION}-sbom.json"

                    echo "Frontend SBOM generated successfully."

                    ls -lh "${WORKSPACE}/sbom/frontend-${APP_VERSION}-sbom.json"
                '''
            }
        }


        // ============================================================
        // FRONTEND TRIVY
        // ============================================================

        stage('Frontend Trivy Scan') {
            steps {

                sh '''
                    echo "Running Trivy frontend image scan..."

                    docker run --rm \
                      -v /var/run/docker.sock:/var/run/docker.sock \
                      aquasec/trivy:latest \
                      image \
                      --severity HIGH,CRITICAL \
                      --exit-code 0 \
                      ${FRONTEND_IMAGE}:${APP_VERSION}

                    echo "Frontend Trivy scan completed."
                '''
            }
        }


        // ============================================================
        // OCIR LOGIN AND PUSH
        // ============================================================

        stage('Push Images to OCIR') {
            steps {

                script {

                    withCredentials([
                        usernamePassword(
                            credentialsId: 'ocir-credentials',
                            usernameVariable: 'OCIR_USERNAME',
                            passwordVariable: 'OCIR_PASSWORD'
                        )
                    ]) {

                        sh '''
                            set -e

                            echo "Logging into OCIR..."

                            echo "${OCIR_PASSWORD}" | docker login \
                              ${OCIR_REGISTRY} \
                              -u "${OCIR_USERNAME}" \
                              --password-stdin

                            echo "OCIR login successful."


                            echo "Tagging backend image..."

                            docker tag \
                              ${BACKEND_IMAGE}:${APP_VERSION} \
                              ${OCIR_REPOSITORY}/${BACKEND_IMAGE}:${APP_VERSION}

                            docker tag \
                              ${BACKEND_IMAGE}:${APP_VERSION} \
                              ${OCIR_REPOSITORY}/${BACKEND_IMAGE}:latest


                            echo "Pushing backend image..."

                            docker push \
                              ${OCIR_REPOSITORY}/${BACKEND_IMAGE}:${APP_VERSION}

                            docker push \
                              ${OCIR_REPOSITORY}/${BACKEND_IMAGE}:latest


                            echo "Tagging frontend image..."

                            docker tag \
                              ${FRONTEND_IMAGE}:${APP_VERSION} \
                              ${OCIR_REPOSITORY}/${FRONTEND_IMAGE}:${APP_VERSION}

                            docker tag \
                              ${FRONTEND_IMAGE}:${APP_VERSION} \
                              ${OCIR_REPOSITORY}/${FRONTEND_IMAGE}:latest


                            echo "Pushing frontend image..."

                            docker push \
                              ${OCIR_REPOSITORY}/${FRONTEND_IMAGE}:${APP_VERSION}

                            docker push \
                              ${OCIR_REPOSITORY}/${FRONTEND_IMAGE}:latest


                            echo "Images pushed successfully."

                            docker logout ${OCIR_REGISTRY}
                        '''
                    }
                }
            }
        }


        // ============================================================
        // UPDATE GITOPS MANIFESTS
        // ============================================================

        stage('Update GitOps Manifests') {
            steps {

                script {

                    withCredentials([
                        usernamePassword(
                            credentialsId: 'github-gitops',
                            usernameVariable: 'GIT_USERNAME',
                            passwordVariable: 'GIT_PASSWORD'
                        )
                    ]) {

                        sh '''
                            set -e

                            echo "======================================"
                            echo "Updating GitOps manifests"
                            echo "======================================"

                            git config user.name "Jenkins"
                            git config user.email "jenkins@auralis.local"

                            echo "Updating backend image..."

                            sed -i \
                              "s#image: .*auralis-backend:.*#image: ${OCIR_REPOSITORY}/auralis-backend:${APP_VERSION}#g" \
                              k8s/backend.yaml


                            echo "Updating frontend image..."

                            sed -i \
                              "s#image: .*auralis-frontend:.*#image: ${OCIR_REPOSITORY}/auralis-frontend:${APP_VERSION}#g" \
                              k8s/frontend.yaml


                            echo "Git diff:"

                            git diff -- k8s/backend.yaml k8s/frontend.yaml


                            git add \
                              k8s/backend.yaml \
                              k8s/frontend.yaml


                            if git diff --cached --quiet; then

                                echo "No GitOps changes detected."

                            else

                                git commit \
                                  -m "Update Auralis images to build ${APP_VERSION} [skip ci]"


                                git remote set-url origin \
                                  "https://${GIT_USERNAME}:${GIT_PASSWORD}@github.com/0x1k4rt1k/auralis-web3-music.git"


                                git push origin HEAD:main

                                echo "GitOps manifests pushed successfully."

                            fi
                        '''
                    }
                }
            }
        }
    }


    // ================================================================
    // POST BUILD
    // ================================================================

    post {

        always {

            echo "======================================"
            echo "Archiving SBOM artifacts"
            echo "======================================"

            archiveArtifacts(
                artifacts: 'sbom/*.json',
                allowEmptyArchive: true,
                fingerprint: true
            )
        }


        success {

            echo "======================================"
            echo "AURALIS DEVSECOPS PIPELINE SUCCESS"
            echo "Build: ${BUILD_NUMBER}"
            echo "Version: ${APP_VERSION}"
            echo "======================================"
        }


        failure {

            echo "======================================"
            echo "AURALIS DEVSECOPS PIPELINE FAILED"
            echo "Build: ${BUILD_NUMBER}"
            echo "======================================"
        }
    }
}
