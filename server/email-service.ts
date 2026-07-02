import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(email: string, dealershipName: string) {
  return await resend.emails.send({
    from: "noreply@dealerships-compliance.com",
    to: email,
    subject: "Welcome to dealerships Compliance Engine",
    html: `
      <h1>Welcome to dealerships!</h1>
      <p>Hi there,</p>
      <p>Your dealership <strong>${dealershipName}</strong> is now set up and ready to begin the FTC Safeguards compliance assessment.</p>
      <p>Start by answering questions across all 9 compliance sections to get your compliance score and identify gaps.</p>
      <p><a href="${process.env.VITE_APP_URL}/wizard" style="background: #d97706; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Start Compliance Wizard</a></p>
      <p>Questions? Contact our support team.</p>
      <p>Best regards,<br/>dealerships Compliance Team</p>
    `,
  });
}

export async function sendComplianceReminderEmail(email: string, dealershipName: string, score: number) {
  return await resend.emails.send({
    from: "noreply@dealerships-compliance.com",
    to: email,
    subject: `Compliance Update: Your Current Score is ${score}%`,
    html: `
      <h1>Compliance Status Update</h1>
      <p>Hi there,</p>
      <p>Your dealership <strong>${dealershipName}</strong> has a current compliance score of <strong>${score}%</strong>.</p>
      ${score < 60 ? `<p style="color: red;"><strong>⚠️ Action Required:</strong> Your compliance score is below 60%. We recommend addressing critical gaps immediately.</p>` : ""}
      ${score >= 60 && score < 80 ? `<p style="color: orange;"><strong>📋 Recommendation:</strong> Continue addressing compliance gaps to improve your score.</p>` : ""}
      ${score >= 80 ? `<p style="color: green;"><strong>✅ Great Progress:</strong> Your dealership is well on its way to full compliance!</p>` : ""}
      <p><a href="${process.env.VITE_APP_URL}/dashboard" style="background: #d97706; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a></p>
      <p>Best regards,<br/>dealerships Compliance Team</p>
    `,
  });
}

export async function sendSubscriptionConfirmationEmail(email: string, dealershipName: string, plan: string) {
  const planName = plan === "core" ? "Core ($199/month)" : "Managed";

  return await resend.emails.send({
    from: "noreply@dealerships-compliance.com",
    to: email,
    subject: `Subscription Confirmed: ${planName} Plan`,
    html: `
      <h1>Subscription Confirmed</h1>
      <p>Hi there,</p>
      <p>Your subscription to the <strong>${planName}</strong> plan has been confirmed for <strong>${dealershipName}</strong>.</p>
      <p>You now have access to:</p>
      <ul>
        <li>WISP PDF generation</li>
        <li>Board-level compliance reports</li>
        <li>Document vault</li>
        <li>Email reminders</li>
        <li>Priority support</li>
      </ul>
      <p><a href="${process.env.VITE_APP_URL}/documents" style="background: #d97706; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Documents</a></p>
      <p>Best regards,<br/>dealerships Compliance Team</p>
    `,
  });
}

export async function sendBreachNotificationEmail(email: string, dealershipName: string) {
  return await resend.emails.send({
    from: "noreply@dealerships-compliance.com",
    to: email,
    subject: "FTC Safeguards Rule Update - Important Compliance Deadline",
    html: `
      <h1>Important: FTC Compliance Deadline</h1>
      <p>Hi there,</p>
      <p>This is a reminder that the FTC Safeguards Rule requires all auto dealerships to maintain a Written Information Security Program (WISP).</p>
      <p>Key compliance requirements:</p>
      <ul>
        <li>Designate a Qualified Individual</li>
        <li>Conduct annual risk assessments</li>
        <li>Implement access controls and encryption</li>
        <li>Maintain incident response plan</li>
        <li>Provide employee training</li>
        <li>Conduct annual penetration testing</li>
      </ul>
      <p>Non-compliance can result in significant FTC penalties.</p>
      <p><a href="${process.env.VITE_APP_URL}/wizard" style="background: #d97706; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Start Assessment</a></p>
      <p>Best regards,<br/>dealerships Compliance Team</p>
    `,
  });
}
