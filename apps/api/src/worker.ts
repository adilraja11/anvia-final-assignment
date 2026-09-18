// Example worker.ts file for BullMQ

// import { Worker } from "bullmq";
// import { connection, JOB_APPLICATION_TRACKER_QUEUE_NAME } from "./config/queue-connection.js";
// import { getBaseJobFitAnalystPrompt, getJobFitAnalystPrompt } from "./modules/job/prompt.js";
// import { generatePerspective } from "./modules/job/services.js";
// import { prisma } from "./utils/prisma.js";

// export const worker = new Worker(
//   JOB_APPLICATION_TRACKER_QUEUE_NAME,
//   async (job) => {
//     console.log('Job:', job.data);
//     const context = `
//       - Profile:
//         - Current Role: Backend Engineer
//         - Current Company: PT Digital Nusantara Teknologi
//         - Industry: FinTech / Digital Payments
//         - Education: B.Sc. in Computer Science, Universitas Indonesia (2018)
//         - Experience: 6 years total. 4 years at PT Digital Nusantara Teknologi as Backend Engineer (built and maintained payment gateway microservices handling ~2M transactions/day, led migration from monolith to Go-based microservices, mentored 2 junior engineers); 2 years prior at a logistics startup as Software Engineer (built internal inventory APIs using Node.js and PostgreSQL)
//         - Specification: Go, Node.js, PostgreSQL, Redis, Kafka, Docker, Kubernetes, AWS (EC2, RDS, S3), system design for high-throughput services, REST & gRPC API design, CI/CD (GitLab CI), basic understanding of PCI-DSS compliance

//       - Job Application:
//         - Job Title = ${job.data.jobTitle}
//         - Company = ${job.data.company}
//         - Location = ${job.data.location}
//         - Description = ${job.data.description}
//         - Qualifications = ${job.data.qualifications}
//     `;

//     const prompts = [
//       getBaseJobFitAnalystPrompt(),
//       getJobFitAnalystPrompt(),
//     ];

//     let finalVerdicts = "";

//     for (const prompt of prompts) {
//       console.log("generating for ", prompt.slice(0, 100));
//       const response = await generatePerspective(context, prompt);
//       finalVerdicts += response + "\n\n";
//     }

//     console.log("final verdicts");
//     console.log(finalVerdicts);

//     try {
//       await prisma.job.update({
//         where: { id: job.data.id },
//         data: { promptresult: finalVerdicts },
//       })
//     } catch (error) {
//       console.error("Error updating job:", error);
//     }
//   },
//   {
//     connection: connection,
//   },
// );
