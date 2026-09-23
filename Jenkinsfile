pipeline {

    agent any

    environment {
        // Application
        APP_NAME = "auralis"
        APP_VERSION = "${BUILD_NUMBER}"

        // Docker images
        BACKEND_IMAGE = "auralis-backend"
        FRONTEND_IMAGE = "auralis-frontend"

        // OCI Registry
        OCI_REGISTRY = "hyd.ocir.io"
        OCI_NAMESPACE = "axedsxii3ulu"
        OCI_REPO = "auralis"

        // Tools
        SYFT_VERSION = "v1.52.0"

        // SonarQube
        SONARQUBE_SERVER = "SonarQube"

        // GitHub
        GITOPS_REPO = "https://github.com/0x1k4rt1k/auralis-web3-music.git"
    }

    stages {

        // ============================================================
        // CHECKOUT
        // ============================================================

        stage('Checkout') {
            steps {
                echo "======================================"
                echo "Checking out source code"
                echo "======================================"

                checkout scm

                sh '''
                    echo "Git commit:"
                    git rev-parse HEAD

                    echo "Git branch:"
                    git branch --show-current

                    echo "Git status:"
                    git status --short
                '''
            }
        }


        // ============================================================
        // ENVIRONMENT CHECK
        // ============================================================

        stage('Environment Check') {
            steps {
                sh '''
                    echo "======================================"
                    echo "Environment Check"
                    echo "======================================"

                    echo "Node:"
                    node --version

                    echo "NPM:"
                    npm --version

                    echo "Git:"
                    git --version

                    echo "Docker:"
                    docker --version

                    echo "Jenkins Build:"
                    echo "${BUILD_NUMBER}"
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
                        echo "======================================"
                        echo "Installing Backend Dependencies"
                        echo "======================================"

                        npm ci
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
                        echo "======================================"
                        echo "Running Unit Tests"
                        echo "======================================"

                        npm test
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
                        echo "======================================"
                        echo "Running ESLint"
                        echo "======================================"

                        npm run lint
                    '''
                }
            }
        }


        // ============================================================
        // GITLEAKS
        // ============================================================

        stage('Gitleaks') {
            steps {
                sh '''
                    echo "======================================"
                    echo "Running Gitleaks"
                    echo "======================================"

                    docker run --rm \
                        -v "$PWD:/repo" \
                        zricethezav/gitleaks:latest \
                        detect \
                        --source=/repo \
                        --no-banner \
                        --exit-code 1
                '''
            }
        }


        // ============================================================
        // OWASP DEPENDENCY CHECK
        // ============================================================

        stage('OWASP Dependency-Check') {
            steps {

                dependencyCheck(
                    additionalArguments: '--nvdApiKeyCredentialsId nvd-api-key',
                    odcInstallation: 'OWASP-Dependency-Check'
                )

                dependencyCheckPublisher(
                    pattern: '**/dependency-check-report.xml',
                    failedTotalCritical: 0,
                    failedTotalHigh: 0,
                    unstableTotalCritical: 0,
                    unstableTotalHigh: 0
                )
            }
        }


        // ============================================================
        // SONARQUBE
        // ============================================================

        stage('SonarQube Analysis') {
            steps {

                withSonarQubeEnv("${SONARQUBE_SERVER}") {

                    withCredentials([
                        string(
                            credentialsId: 'sonar-token',
                            variable: 'SONAR_TOKEN'
                        )
                    ]) {

                        sh '''
                            echo "======================================"
                            echo "Running SonarQube Analysis"
                            echo "======================================"

                            sonar-scanner \
                              -Dsonar.projectKey=auralis-web3-music \
                              -Dsonar.projectName=Auralis-Web3-Music \
                              -Dsonar.sources=backend \
                              -Dsonar.host.url=$SONAR_HOST_URL \
                              -Dsonar.token=$SONAR_TOKEN
                        '''
                    }
                }
            }
        }


        // ============================================================
        // SONAR QUALITY GATE
        // ============================================================

        stage('SonarQube Quality Gate') {
            steps {
                timeout(time: 10, unit: 'MINUTES') {

                    waitForQualityGate abortPipeline: false
                }
            }
        }


        // ============================================================
        // TRIVY FILESYSTEM SCAN
        // ============================================================

        stage('Trivy Filesystem Scan') {
            steps {
                sh '''
                    echo "======================================"
                    echo "Running Trivy Filesystem Scan"
                    echo "======================================"

                    docker run --rm \
                        -v "$PWD:/src" \
                        aquasec/trivy:latest \
                        fs \
                        --severity HIGH,CRITICAL \
                        --exit-code 0 \
                        /src
                '''
            }
        }


        // ============================================================
        // BUILD BACKEND IMAGE
        // ============================================================

        stage('Build Backend Image') {
            steps {
                sh '''
                    echo "======================================"
                    echo "Building Backend Docker Image"
                    echo "======================================"

                    docker build \
                        -t ${BACKEND_IMAGE}:${APP_VERSION} \
                        -t ${BACKEND_IMAGE}:latest \
                        ./backend

                    docker image inspect \
                        ${BACKEND_IMAGE}:${APP_VERSION}
                '''
            }
        }


        // ============================================================
        // BUILD FRONTEND IMAGE
        // ============================================================

        stage('Build Frontend Image') {
            steps {
                sh '''
                    echo "======================================"
                    echo "Building Frontend Docker Image"
                    echo "======================================"

                    docker build \
                        -t ${FRONTEND_IMAGE}:${APP_VERSION} \
                        -t ${FRONTEND_IMAGE}:latest \
                        ./frontend

                    docker image inspect \
                        ${FRONTEND_IMAGE}:${APP_VERSION}
                '''
            }
        }


        // ============================================================
        // TRIVY BACKEND IMAGE
        // ============================================================

        stage('Trivy Backend Image Scan') {
            steps {
                sh '''
                    echo "======================================"
                    echo "Scanning Backend Image"
                    echo "======================================"

                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        aquasec/trivy:latest \
                        image \
                        --severity HIGH,CRITICAL \
                        --exit-code 0 \
                        ${BACKEND_IMAGE}:${APP_VERSION}
                '''
            }
        }


        // ============================================================
        // TRIVY FRONTEND IMAGE
        // ============================================================

        stage('Trivy Frontend Image Scan') {
            steps {
                sh '''
                    echo "======================================"
                    echo "Scanning Frontend Image"
                    echo "======================================"

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


        // ============================================================
        // BACKEND SBOM
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

                    docker image inspect \
                        "${BACKEND_IMAGE}:${APP_VERSION}" \
                        >/dev/null

                    echo "Running Syft ${SYFT_VERSION}..."

                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        ghcr.io/anchore/syft:${SYFT_VERSION} \
                        "docker:${BACKEND_IMAGE}:${APP_VERSION}" \
                        -o cyclonedx-json=- \
                        > "${WORKSPACE}/sbom/backend-${APP_VERSION}-sbom.json"

                    echo "Checking generated SBOM..."

                    if [ ! -s "${WORKSPACE}/sbom/backend-${APP_VERSION}-sbom.json" ]; then
                        echo "ERROR: Backend SBOM was not generated."
                        exit 1
                    fi

                    echo "Backend SBOM generated successfully."

                    ls -lh \
                        "${WORKSPACE}/sbom/backend-${APP_VERSION}-sbom.json"
                '''
            }
        }


        // ============================================================
        // FRONTEND SBOM
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

                    docker image inspect \
                        "${FRONTEND_IMAGE}:${APP_VERSION}" \
                        >/dev/null

                    echo "Running Syft ${SYFT_VERSION}..."

                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        ghcr.io/anchore/syft:${SYFT_VERSION} \
                        "docker:${FRONTEND_IMAGE}:${APP_VERSION}" \
                        -o cyclonedx-json=- \
                        > "${WORKSPACE}/sbom/frontend-${APP_VERSION}-sbom.json"

                    echo "Checking generated SBOM..."

                    if [ ! -s "${WORKSPACE}/sbom/frontend-${APP_VERSION}-sbom.json" ]; then
                        echo "ERROR: Frontend SBOM was not generated."
                        exit 1
                    fi

                    echo "Frontend SBOM generated successfully."

                    ls -lh \
                        "${WORKSPACE}/sbom/frontend-${APP_VERSION}-sbom.json"
                '''
            }
        }


        // ============================================================
        // ARCHIVE SBOM
        // ============================================================

        stage('Archive SBOM') {
            steps {
                echo "======================================"
                echo "Archiving SBOM Files"
                echo "======================================"

                archiveArtifacts(
                    artifacts: 'sbom/*.json',
                    fingerprint: true,
                    allowEmptyArchive: false
                )

                sh '''
                    echo "Generated SBOM files:"
                    ls -lh sbom/
                '''
            }
        }


        // ============================================================
        // LOGIN TO OCI
        // ============================================================

        stage('OCI Registry Login') {
            steps {

                withCredentials([
                    usernamePassword(
                        credentialsId: 'ocir-credentials',
                        usernameVariable: 'OCIR_USERNAME',
                        passwordVariable: 'OCIR_PASSWORD'
                    )
                ]) {

                    sh '''
                        echo "======================================"
                        echo "Logging into OCI Registry"
                        echo "======================================"

                        echo "$OCIR_PASSWORD" | docker login \
                            ${OCI_REGISTRY} \
                            -u "$OCIR_USERNAME" \
                            --password-stdin
                    '''
                }
            }
        }


        // ============================================================
        // TAG BACKEND
        // ============================================================

        stage('Tag Backend Image') {
            steps {
                sh '''
                    docker tag \
                        ${BACKEND_IMAGE}:${APP_VERSION} \
                        ${OCI_REGISTRY}/${OCI_NAMESPACE}/${OCI_REPO}:backend-${APP_VERSION}

                    docker tag \
                        ${BACKEND_IMAGE}:${APP_VERSION} \
                        ${OCI_REGISTRY}/${OCI_NAMESPACE}/${OCI_REPO}:backend-latest
                '''
            }
        }


        // ============================================================
        // TAG FRONTEND
        // ============================================================

        stage('Tag Frontend Image') {
            steps {
                sh '''
                    docker tag \
                        ${FRONTEND_IMAGE}:${APP_VERSION} \
                        ${OCI_REGISTRY}/${OCI_NAMESPACE}/${OCI_REPO}:frontend-${APP_VERSION}

                    docker tag \
                        ${FRONTEND_IMAGE}:${APP_VERSION} \
                        ${OCI_REGISTRY}/${OCI_NAMESPACE}/${OCI_REPO}:frontend-latest
                '''
            }
        }


        // ============================================================
        // PUSH BACKEND
        // ============================================================

        stage('Push Backend Image') {
            steps {
                sh '''
                    echo "======================================"
                    echo "Pushing Backend Image"
                    echo "======================================"

                    docker push \
                        ${OCI_REGISTRY}/${OCI_NAMESPACE}/${OCI_REPO}:backend-${APP_VERSION}

                    docker push \
                        ${OCI_REGISTRY}/${OCI_NAMESPACE}/${OCI_REPO}:backend-latest
                '''
            }
        }


        // ============================================================
        // PUSH FRONTEND
        // ============================================================

        stage('Push Frontend Image') {
            steps {
                sh '''
                    echo "======================================"
                    echo "Pushing Frontend Image"
                    echo "======================================"

                    docker push \
                        ${OCI_REGISTRY}/${OCI_NAMESPACE}/${OCI_REPO}:frontend-${APP_VERSION}

                    docker push \
                        ${OCI_REGISTRY}/${OCI_NAMESPACE}/${OCI_REPO}:frontend-latest
                '''
            }
        }


        // ============================================================
        // UPDATE GITOPS MANIFESTS
        // ============================================================

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
                        set -e

                        echo "======================================"
                        echo "Updating GitOps Manifests"
                        echo "======================================"

                        git config user.name "Jenkins"
                        git config user.email "jenkins@auralis.local"

                        sed -i \
                          "s|backend-[0-9][0-9]*|backend-${APP_VERSION}|g" \
                          k8s/backend.yaml

                        sed -i \
                          "s|frontend-[0-9][0-9]*|frontend-${APP_VERSION}|g" \
                          k8s/frontend.yaml

                        echo "Updated manifests:"
                        grep -n "image:" k8s/backend.yaml || true
                        grep -n "image:" k8s/frontend.yaml || true

                        git add k8s/backend.yaml k8s/frontend.yaml

                        if git diff --cached --quiet; then
                            echo "No GitOps changes detected."
                        else
                            git commit \
                              -m "chore: update Auralis images to build ${APP_VERSION}"

                            git push \
                              https://${GIT_USERNAME}:${GIT_TOKEN}@github.com/0x1k4rt1k/auralis-web3-music.git \
                              HEAD:main
                        fi
                    '''
                }
            }
        }
    }


    // ================================================================
    // POST ACTIONS
    // ================================================================

    post {

        success {
            echo """
            ======================================
            AURALIS PIPELINE SUCCESS
            ======================================

            Build: ${BUILD_NUMBER}

            Backend:
            ${OCI_REGISTRY}/${OCI_NAMESPACE}/${OCI_REPO}:backend-${APP_VERSION}

            Frontend:
            ${OCI_REGISTRY}/${OCI_NAMESPACE}/${OCI_REPO}:frontend-${APP_VERSION}

            SBOM:
            Backend -> sbom/backend-${APP_VERSION}-sbom.json
            Frontend -> sbom/frontend-${APP_VERSION}-sbom.json

            GitOps manifests updated.

            Argo CD should detect the Git change
            and synchronize the application to OKE.
            ======================================
            """
        }

        failure {
            echo """
            ======================================
            AURALIS PIPELINE FAILED
            ======================================

            Build: ${BUILD_NUMBER}

            Check the Jenkins console output
            for the failed stage.

            ======================================
            """
        }

        always {
            echo "Cleaning temporary workspace files..."

            sh '''
                rm -rf sbom/*.tmp 2>/dev/null || true
            '''
        }
    }
}
