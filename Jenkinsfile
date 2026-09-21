pipeline {
    agent any

    tools {
        nodejs 'NodeJS-22'
    }

    environment {
        APP_IMAGE = 'auralis-backend'
        FRONTEND_IMAGE = 'auralis-frontend'
        APP_VERSION = "${BUILD_NUMBER}"

        // OCI Container Registry
        OCIR_REGISTRY = 'hyd.ocir.io'
        OCIR_REPOSITORY = 'hyd.ocir.io/axedsxii3ulu/auralis'
        OCIR_FRONTEND_REPOSITORY = 'hyd.ocir.io/axedsxii3ulu/auralis-frontend'
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

        // =========================
        // BACKEND
        // =========================

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

                        echo "===== Tagging Backend Images ====="

                        docker tag ${APP_IMAGE}:${APP_VERSION} \
                            ${OCIR_REPOSITORY}:${APP_VERSION}

                        docker tag ${APP_IMAGE}:latest \
                            ${OCIR_REPOSITORY}:latest

                        echo "===== Pushing Backend Version ====="

                        docker push ${OCIR_REPOSITORY}:${APP_VERSION}

                        echo "===== Pushing Backend Latest ====="

                        docker push ${OCIR_REPOSITORY}:latest

                        echo "===== Backend OCIR Push Completed ====="
                    '''
                }
            }
        }

        // =========================
        // FRONTEND
        // =========================

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

                        echo "===== Tagging Frontend Images ====="

                        docker tag ${FRONTEND_IMAGE}:${APP_VERSION} \
                            ${OCIR_FRONTEND_REPOSITORY}:${APP_VERSION}

                        docker tag ${FRONTEND_IMAGE}:latest \
                            ${OCIR_FRONTEND_REPOSITORY}:latest

                        echo "===== Pushing Frontend Version ====="

                        docker push ${OCIR_FRONTEND_REPOSITORY}:${APP_VERSION}

                        echo "===== Pushing Frontend Latest ====="

                        docker push ${OCIR_FRONTEND_REPOSITORY}:latest

                        echo "===== Frontend OCIR Push Completed ====="

                        docker logout "$OCIR_REGISTRY"
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
        }

        success {
            echo 'Auralis DevSecOps pipeline completed successfully.'
        }

        failure {
            echo 'Auralis DevSecOps pipeline failed. Check the failed stage logs.'
        }
    }
}
