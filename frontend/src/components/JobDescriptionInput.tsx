import { useState, useRef, useCallback } from 'react';
import { ArrowRight, Settings, FileText, ChevronDown, Upload, File, X, Loader2, Mic, ImageIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { parsePdf } from '../api';

const SAMPLE_JOB_DESCRIPTIONS = [
    // Backend Engineering
    {
        title: 'Senior Backend Engineer (Python)',
        description: `Senior Backend Engineer - Python

We are looking for a Senior Backend Engineer to join our platform team building high-throughput payment systems.

Requirements:
- 6+ years of experience in backend development with Python
- Expert knowledge of FastAPI, Django, or Flask
- Experience with PostgreSQL, Redis, and Kafka/RabbitMQ
- Strong understanding of microservices and event-driven architecture
- Experience with Docker, Kubernetes, and AWS
- Solid grasp of RESTful API design and async programming

Nice to have:
- Experience with distributed systems at scale
- Knowledge of gRPC and Protocol Buffers
- Payment processing or fintech experience`
    },
    {
        title: 'Staff Engineer (Go/Distributed Systems)',
        description: `Staff Software Engineer - Go

Join our infrastructure team to build high-performance distributed systems handling millions of requests per second.

What you'll do:
- Design and implement low-latency services in Go
- Build geospatial indexing and real-time tracking systems
- Create service mesh infrastructure and gRPC services
- Mentor engineers on Go best practices and concurrent programming

Requirements:
- 5+ years of Go development experience
- Expert in concurrent programming and goroutines
- Experience with PostgreSQL, Redis, and Kafka
- Strong understanding of distributed systems and CAP theorem
- Experience with Kubernetes and Prometheus

Preferred:
- Contributions to Go open source projects
- Experience with ride-sharing or real-time location systems`
    },
    // Data & AI
    {
        title: 'Senior Data Scientist',
        description: `Senior Data Scientist

We're seeking a Senior Data Scientist to lead our pricing optimization and demand forecasting initiatives.

Responsibilities:
- Build statistical models and ML algorithms for business optimization
- Design and analyze A/B tests with causal inference methods
- Create customer segmentation and lifetime value models
- Collaborate with product teams on data-driven decisions

Requirements:
- PhD or MS in Statistics, Mathematics, or related quantitative field
- 5+ years of experience in data science
- Expert in Python, SQL, and Spark
- Strong background in statistical modeling and experimentation
- Experience with Airflow, MLflow, and cloud data platforms

Preferred:
- Experience with Bayesian methods and time series analysis
- Background in pricing or marketplace optimization`
    },
    {
        title: 'NLP/LLM Engineer',
        description: `NLP Engineer - Large Language Models

Join our AI team to build next-generation natural language understanding systems.

What you'll do:
- Develop and fine-tune large language models for production use
- Build RAG (Retrieval Augmented Generation) pipelines
- Create evaluation frameworks for model safety and quality
- Optimize inference for low-latency serving

Requirements:
- MS or PhD in NLP, Computational Linguistics, or ML
- 4+ years building production NLP systems
- Expert in PyTorch, Transformers, and Hugging Face ecosystem
- Experience with BERT, GPT, T5, or LLaMA architectures
- Knowledge of vector databases (Pinecone, Weaviate, Qdrant)

Preferred:
- Experience with RLHF and constitutional AI
- Publications in ACL, EMNLP, or NeurIPS
- Multilingual NLP experience`
    },
    {
        title: 'Computer Vision Engineer',
        description: `Computer Vision Engineer - Autonomous Systems

We're building the future of autonomous vehicles and need a Computer Vision Engineer to join our perception team.

Responsibilities:
- Develop 3D object detection and segmentation models
- Build real-time perception pipelines for camera and LiDAR
- Optimize neural networks for edge deployment (TensorRT)
- Work on depth estimation and visual odometry

Requirements:
- MS or PhD in Computer Vision or related field
- 4+ years experience in production CV systems
- Expert in PyTorch, OpenCV, and CUDA programming
- Experience with object detection (YOLO, Faster R-CNN)
- Knowledge of 3D vision, point clouds, and SLAM

Preferred:
- Experience with autonomous vehicles or robotics
- Familiarity with ROS and sensor fusion
- Real-time systems optimization experience`
    },
    // Infrastructure & Platform
    {
        title: 'Site Reliability Engineer',
        description: `Site Reliability Engineer

We need an SRE to ensure 99.99% uptime for our platform serving millions of users globally.

Responsibilities:
- Design disaster recovery and high availability systems
- Build automated capacity planning and scaling solutions
- Create incident response frameworks and runbooks
- Implement SLOs, SLIs, and error budgets

Requirements:
- 6+ years in SRE or DevOps roles
- Expert in Kubernetes, Terraform, and AWS/GCP
- Strong programming skills in Go or Python
- Experience with Prometheus, Grafana, and observability tools
- On-call and incident management experience

Preferred:
- Experience with chaos engineering (Chaos Monkey, Litmus)
- Background in large-scale distributed systems
- Service mesh experience (Istio, Linkerd)`
    },
    {
        title: 'Cloud Solutions Architect',
        description: `Cloud Solutions Architect - AWS

Join our architecture team to design enterprise cloud solutions for Fortune 500 clients.

Responsibilities:
- Design multi-region, highly available cloud architectures
- Lead cloud migration and modernization initiatives
- Create Well-Architected reviews and cost optimization strategies
- Build reference architectures for serverless and container workloads

Requirements:
- 8+ years in cloud architecture roles
- AWS Solutions Architect Professional certification
- Expert in Terraform, CDK, and Infrastructure as Code
- Experience with microservices, event-driven, and serverless patterns
- Strong communication and stakeholder management skills

Preferred:
- Multi-cloud experience (AWS, Azure, GCP)
- Enterprise integration and API gateway experience
- FinOps and cloud cost optimization background`
    },
    {
        title: 'Security Engineer (AppSec)',
        description: `Application Security Engineer

We're looking for a Security Engineer to protect our payment infrastructure and customer data.

Responsibilities:
- Conduct penetration testing and security assessments
- Build automated security scanning in CI/CD pipelines
- Design zero-trust architecture and IAM policies
- Lead incident response for security events

Requirements:
- 5+ years in application security roles
- OSCP, CISSP, or equivalent certifications
- Expert in OWASP Top 10 and secure coding practices
- Experience with Burp Suite, static analysis tools
- Knowledge of cloud security (AWS, Kubernetes)

Preferred:
- Experience in fintech or payment security
- Bug bounty or CTF competition background
- Cryptography and key management experience`
    },
    // Mobile Development
    {
        title: 'Senior iOS Developer',
        description: `Senior iOS Developer

Join our mobile team to build consumer apps used by millions of users worldwide.

Responsibilities:
- Develop native iOS applications using Swift and SwiftUI
- Build real-time features with MapKit and Core Location
- Implement offline-first architecture and local caching
- Optimize for performance and battery efficiency

Requirements:
- 5+ years of native iOS development experience
- Expert in Swift, SwiftUI, UIKit, and Combine
- Experience with Core Data, AVFoundation, and Metal
- Strong understanding of iOS app lifecycle and memory management
- Published apps on the App Store

Preferred:
- Experience with ARKit or Core ML
- MVVM or Clean Architecture experience
- Accessibility (VoiceOver) implementation`
    },
    {
        title: 'Android Developer (Kotlin)',
        description: `Senior Android Developer

We're building the next generation of our Android app and need an experienced Kotlin developer.

Responsibilities:
- Develop Android applications using Kotlin and Jetpack Compose
- Build modular architecture with feature team autonomy
- Implement A/B testing and experimentation framework
- Optimize for smooth 60fps scrolling and responsiveness

Requirements:
- 5+ years of Android development experience
- Expert in Kotlin, Jetpack Compose, and Coroutines/Flow
- Experience with Room, Hilt, and Navigation components
- Strong understanding of MVVM, MVI, and Clean Architecture
- Experience with CI/CD and Play Store deployment

Preferred:
- Google Maps and location services experience
- Performance profiling and optimization
- Cross-functional collaboration experience`
    },
    // Frontend Development
    {
        title: 'Staff Frontend Engineer (React)',
        description: `Staff Frontend Engineer - React

Join our product team to build collaborative tools used by millions of knowledge workers.

Responsibilities:
- Build real-time collaborative features with CRDT synchronization
- Develop React Server Components and Next.js applications
- Create and maintain design system with 100+ components
- Lead performance optimization (Core Web Vitals)

Requirements:
- 6+ years of React/TypeScript development
- Expert in Next.js, Redux/Zustand, and React Query
- Strong CSS skills (Tailwind, Styled Components)
- Experience with WebSocket and real-time systems
- Testing expertise (Jest, Playwright, Cypress)

Preferred:
- Experience with collaborative editing (CRDT, OT)
- PWA and Service Worker knowledge
- Animation libraries (Framer Motion, GSAP)`
    },
    {
        title: 'Frontend Developer (Vue.js)',
        description: `Frontend Developer - Vue.js

We're looking for a Vue.js developer to help build our developer platform used by millions.

Responsibilities:
- Build and maintain Vue 3 applications with Composition API
- Develop CI/CD pipeline visualization components
- Create reusable component library with Storybook
- Implement dark mode and accessibility features

Requirements:
- 3+ years of Vue.js development experience
- Proficiency in TypeScript and Pinia/Vuex
- Strong CSS skills (SCSS, Tailwind)
- Experience with Vitest, Cypress, and testing practices
- Understanding of web accessibility (WCAG)

Preferred:
- Open source contribution experience
- Nuxt.js or SSR experience
- Design system maintenance background`
    },
    // Specialized Roles
    {
        title: 'Blockchain Developer (Solidity)',
        description: `Blockchain Developer - DeFi

Join our protocol team to build the next generation of decentralized finance applications.

Responsibilities:
- Develop and audit smart contracts in Solidity
- Build gas-optimized DeFi protocols (AMMs, lending)
- Create cross-chain messaging and bridge solutions
- Implement security testing and formal verification

Requirements:
- 3+ years of Solidity development experience
- Deep understanding of EVM and gas optimization
- Experience with Foundry, Hardhat, and The Graph
- Knowledge of DeFi protocols (Uniswap, Aave, Compound)
- Security auditing experience

Preferred:
- Rust experience for cross-chain development
- MEV and flashbot knowledge
- Published security audits or bug bounties`
    },
    {
        title: 'Game Developer (Unity/Unreal)',
        description: `Senior Game Developer

Join our AAA game studio to build the next blockbuster multiplayer experience.

Responsibilities:
- Develop gameplay systems and networking code
- Build character animation and physics systems
- Create tools for artists and designers
- Optimize for console and PC performance

Requirements:
- 5+ years of game development experience
- Expert in C++ and/or C# with Unity or Unreal Engine
- Strong 3D math and graphics programming skills
- Experience with multiplayer networking and replication
- Shipped at least one commercial game title

Preferred:
- AAA studio experience
- Graphics programming (DirectX, Vulkan, OpenGL)
- AI programming and pathfinding systems`
    },
    {
        title: 'QA Automation Engineer',
        description: `Senior QA Automation Engineer

We need a QA Engineer to build our test automation infrastructure and ensure product quality.

Responsibilities:
- Build and maintain test automation frameworks
- Develop API, UI, and mobile test suites
- Create performance and load testing solutions
- Implement visual regression testing

Requirements:
- 4+ years in QA automation roles
- Expert in Python or Java with Selenium/Playwright
- Experience with REST API testing (REST Assured, Postman)
- Knowledge of CI/CD integration (Jenkins, GitHub Actions)
- Mobile testing experience (Appium)

Preferred:
- Contract testing experience (Pact)
- Performance testing tools (JMeter, Gatling)
- ISTQB certification`
    },
    // Emerging Tech
    {
        title: 'AR/VR Developer (XR)',
        description: `XR Developer - Spatial Computing

Join our Reality Labs team to build the future of immersive experiences.

Responsibilities:
- Develop AR/VR applications for Meta Quest and Vision Pro
- Build hand tracking and spatial interaction systems
- Create mixed reality features with passthrough
- Optimize for mobile VR performance

Requirements:
- 3+ years of XR development experience
- Expert in Unity or Unreal with VR SDKs
- Experience with ARKit, ARCore, or Meta SDK
- Strong 3D graphics and shader programming skills
- Knowledge of spatial audio and haptics

Preferred:
- Published VR/AR applications
- Computer vision or SLAM experience
- Enterprise XR application development`
    },
    {
        title: 'Robotics Software Engineer',
        description: `Robotics Software Engineer

Join our robotics team to build autonomous navigation systems for warehouse robots.

Responsibilities:
- Develop robot navigation and motion planning algorithms
- Build sensor fusion pipelines (LiDAR, cameras, IMU)
- Create SLAM and localization systems
- Implement multi-robot coordination

Requirements:
- MS or PhD in Robotics or related field
- 4+ years of robotics software development
- Expert in C++, Python, and ROS/ROS2
- Experience with motion planning (MoveIt, OMPL)
- Knowledge of Kalman filters and state estimation

Preferred:
- Autonomous vehicle or warehouse robotics experience
- Real-time systems and embedded development
- Simulation experience (Gazebo, Isaac Sim)`
    },
    {
        title: 'IoT/Embedded Engineer',
        description: `Senior IoT Engineer

We're building the next generation of connected devices and need an embedded systems expert.

Responsibilities:
- Develop firmware for IoT devices and sensors
- Build edge computing and real-time analytics solutions
- Implement secure OTA update systems
- Design low-power battery-optimized solutions

Requirements:
- 5+ years of embedded systems development
- Expert in C/C++ and RTOS (FreeRTOS, Zephyr)
- Experience with MQTT, CoAP, and IoT protocols
- Knowledge of Bluetooth LE, WiFi, and LoRaWAN
- Experience with Azure IoT or AWS IoT

Preferred:
- PCB design and hardware debugging experience
- Matter/Thread protocol knowledge
- Automotive or industrial IoT background`
    },
    // Domain-Specific
    {
        title: 'Healthcare Developer (FHIR)',
        description: `Healthcare Software Developer

Join our health tech team to build interoperable healthcare solutions.

Responsibilities:
- Develop FHIR-compliant APIs and integrations
- Build EHR connectivity with HL7 and CDA standards
- Implement HIPAA-compliant data handling
- Create clinical decision support tools

Requirements:
- 4+ years of healthcare software development
- Expert in HL7 FHIR and healthcare interoperability
- Experience with C#/.NET or Java
- Knowledge of HIPAA, HITRUST compliance
- Understanding of medical terminology (ICD-10, SNOMED)

Preferred:
- Epic or Cerner integration experience
- Clinical workflow knowledge
- FDA regulated software experience`
    },
    {
        title: 'Fintech Engineer (Trading Systems)',
        description: `Fintech Engineer - Trading Platform

We're building a next-generation trading platform and need engineers who understand financial systems.

Responsibilities:
- Build order execution and matching engines
- Develop real-time portfolio tracking systems
- Create regulatory compliance (SEC, FINRA) features
- Implement market data processing pipelines

Requirements:
- 5+ years in fintech or trading systems
- Expert in Python, Go, or Java
- Experience with PostgreSQL, Redis, and Kafka
- Knowledge of FIX protocol and market data feeds
- Understanding of financial regulations

Preferred:
- Series 7 or related certifications
- Quantitative finance background
- Low-latency systems experience`
    },
    {
        title: 'Engineering Manager',
        description: `Engineering Manager - Platform Team

We're looking for an experienced Engineering Manager to lead our platform engineering organization.

Responsibilities:
- Lead and grow a team of 8-12 engineers
- Define technical roadmap and architectural direction
- Drive hiring, career development, and performance management
- Collaborate with product and design on strategy

Requirements:
- 8+ years of software engineering experience
- 3+ years of engineering management experience
- Strong technical background in distributed systems
- Track record of building high-performing teams
- Experience with agile methodologies

Preferred:
- Experience scaling teams from 5 to 20+ engineers
- Platform or infrastructure team leadership
- Remote team management experience`
    }
];

interface JobDescriptionInputProps {
    onSubmit: (description: string) => void;
    isLoading?: boolean;
}

export function JobDescriptionInput({ onSubmit, isLoading }: JobDescriptionInputProps) {
    const [description, setDescription] = useState('');
    const [showSamples, setShowSamples] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (description.trim()) {
            onSubmit(description);
        }
    };

    const handleSelectSample = (sample: typeof SAMPLE_JOB_DESCRIPTIONS[0]) => {
        setDescription(sample.description);
        setShowSamples(false);
        setSelectedFile(null);
        setParseError(null);
    };

    const handleFileSelect = async (file: File | null) => {
        if (!file) return;

        if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
            setParseError('Please select a PDF file');
            return;
        }

        setSelectedFile(file);
        setParseError(null);
        setIsParsing(true);

        try {
            const result = await parsePdf(file);
            setDescription(result.text);
            setParseError(null);
        } catch (error: any) {
            setParseError(error.response?.data?.detail || 'Failed to parse PDF. Please try again or paste the text manually.');
            setSelectedFile(null);
        } finally {
            setIsParsing(false);
        }
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    }, []);

    const clearFile = () => {
        setSelectedFile(null);
        setParseError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="min-h-screen flex flex-col gradient-bg">
            {/* Admin link in header */}
            <header className="flex justify-end px-6 py-4">
                <Link
                    to="/admin"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 px-2.5 py-1 rounded-md hover:bg-white/50 dark:hover:bg-white/10"
                >
                    <Settings className="w-3.5 h-3.5" />
                    Admin
                </Link>
            </header>

            {/* Main content */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
                <div className="w-full max-w-xl">
                    {/* Logo / Brand */}
                    <div className="text-center mb-10">
                        <div className="inline-block float-animation">
                            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-purple-500 to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-[shimmer_3s_ease-in-out_infinite]">
                                EquiHire
                            </h1>
                        </div>
                        <p className="text-muted-foreground mt-2 text-sm font-light tracking-wide">
                            Find the right candidates, faster
                        </p>
                    </div>

                    {/* Main Input Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-purple-500/20 to-primary/20 rounded-xl opacity-0 group-focus-within:opacity-100 blur transition-all duration-500" />
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Paste the job description here or describe the ideal candidate…"
                                className="textarea-field min-h-[160px] pr-12 relative text-sm"
                                disabled={isLoading || isParsing}
                            />
                            <button
                                type="button"
                                className="absolute right-3 bottom-3 p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all duration-200 hover:scale-110"
                                title="Voice input coming soon"
                            >
                                <Mic className="w-4 h-4" />
                            </button>
                        </div>

                        {/* PDF Upload Section */}
                        <div className="relative">
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`
                                    border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-300 backdrop-blur-sm
                                    ${isDragging
                                        ? 'border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/10'
                                        : 'border-border/60 hover:border-primary/50 hover:bg-white/50 dark:hover:bg-white/5 bg-white/30 dark:bg-white/5'
                                    }
                                    ${isParsing ? 'opacity-50 cursor-wait' : ''}
                                `}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,application/pdf"
                                    onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                                    className="hidden"
                                    disabled={isParsing || isLoading}
                                />

                                {isParsing ? (
                                    <div className="flex items-center justify-center gap-2 py-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                        <span className="text-xs text-muted-foreground font-medium">Extracting text from PDF...</span>
                                    </div>
                                ) : selectedFile ? (
                                    <div className="flex items-center justify-center gap-2 py-2">
                                        <div className="p-1.5 bg-red-50 dark:bg-red-500/10 rounded-md">
                                            <File className="w-4 h-4 text-red-500" />
                                        </div>
                                        <span className="text-xs text-foreground font-medium">{selectedFile.name}</span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                clearFile();
                                            }}
                                            className="p-1 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive transition-all duration-200 hover:scale-110"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2 py-2">
                                        <div className={`p-1.5 rounded-md transition-all duration-300 ${isDragging ? 'bg-primary/10' : 'bg-muted/50'}`}>
                                            <Upload className={`w-4 h-4 transition-colors duration-300 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            Drop a PDF here or <span className="text-primary font-medium">browse</span>
                                        </span>
                                    </div>
                                )}
                            </div>

                            {parseError && (
                                <p className="mt-1.5 text-xs text-destructive">{parseError}</p>
                            )}
                        </div>

                        {/* Image Upload Section */}
                        <div
                            className="border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-300 border-border/60 hover:border-primary/50 hover:bg-white/50 dark:hover:bg-white/5 bg-white/30 dark:bg-white/5 backdrop-blur-sm group"
                        >
                            <div className="flex items-center justify-center gap-2 py-2">
                                <div className="p-1.5 rounded-md bg-muted/50 group-hover:bg-primary/10 transition-all duration-300">
                                    <ImageIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    Or upload an <span className="text-primary font-medium">image</span> of the job description
                                </span>
                            </div>
                        </div>

                        {/* Sample Job Descriptions */}
                        <div className="relative flex justify-center">
                            <button
                                type="button"
                                onClick={() => setShowSamples(!showSamples)}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-all duration-200 px-3 py-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-white/10"
                            >
                                <FileText className="w-3.5 h-3.5" />
                                Try a sample job description
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${showSamples ? 'rotate-180' : ''}`} />
                            </button>

                            {showSamples && (
                                <div className="absolute left-0 right-0 mt-10 bg-white/80 dark:bg-card/90 backdrop-blur-xl border border-white/20 dark:border-border rounded-xl shadow-2xl shadow-black/10 z-10 overflow-hidden">
                                    <div className="p-2">
                                        <p className="text-[10px] text-muted-foreground px-2.5 py-1.5 font-medium uppercase tracking-wider">Select a sample</p>
                                        {SAMPLE_JOB_DESCRIPTIONS.map((sample, index) => (
                                            <button
                                                key={index}
                                                type="button"
                                                onClick={() => handleSelectSample(sample)}
                                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary/10 transition-all duration-200 group"
                                            >
                                                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{sample.title}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={!description.trim() || isLoading || isParsing}
                            className="btn-primary w-full py-3 text-sm rounded-xl mt-1"
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Finding candidates…
                                </span>
                            ) : (
                                <>
                                    Find candidates
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Helper Text */}
                    <div className="text-center mt-8 space-y-1.5">
                        <p className="text-xs text-muted-foreground">
                            We match candidates based on skills and experience, not keywords.
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 flex items-center justify-center gap-1">
                            <span className="inline-block w-1 h-1 rounded-full bg-emerald-500"></span>
                            Transparent, explainable AI scoring with no hard exclusions
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
