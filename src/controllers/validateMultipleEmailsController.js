import { verifyEmailFormat } from "../services/verifyEmailFormat.js";
import { resolveMxRecords } from "../services/resolveMxRecords.js";
import { testInboxOnServer } from "../services/testInboxOnServer.js";
import { randomBytes } from "crypto";

export const validateMultipleEmails = async (req, res) => {
  try {
    if (!Array.isArray(req.body.emails)) {
      return res.status(400).json({ error: "emails must be an array" });
    }

    const emails = req.body.emails;
    
    if (emails.length > 100) {
      return res.status(400).json({ error: "maximum 100 emails allowed per request" });
    }

    const results = await Promise.all(emails.map(validateSingleEmail));

    res.json(results);
  } catch (error) {
    console.error("Unexpected error in batch validation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

async function validateSingleEmail(email) {
  try {
    const emailFormatIsValid = verifyEmailFormat(email);

    if (!emailFormatIsValid) {
      return createEmailResult(email, false);
    }

    const [, domain] = email.split("@");
    const mxRecords = await resolveMxRecords(domain);
    const sortedMxRecords = mxRecords.sort((a, b) => a.priority - b.priority);

    if (sortedMxRecords.length === 0) {
      return createEmailResult(email, emailFormatIsValid, "No MX records found");
    }

    const smtpResult = await testSmtpConnection(sortedMxRecords, email);

    if (!smtpResult || !smtpResult.connection_succeeded) {
      return res.status(500).json({ error: smtpResult.error || "Failed to connect to SMTP server" });
    }

    const usesCatchAll = await testCatchAll(sortedMxRecords[0].exchange, domain);

    return {
      email,
      email_format_is_valid: emailFormatIsValid,
      uses_catch_all: usesCatchAll,
      protocol: smtpResult.protocol, // New field
      ...smtpResult
    };
  } catch (error) {
    console.error(`Error validating email ${email}:`, error);
    return createEmailResult(email, false, "Failed to validate email: " + error.message);
  }
}

function createEmailResult(email, formatValid, errorMessage = null) {
  return {
    email,
    error: errorMessage,
    email_format_is_valid: formatValid,
    uses_catch_all: false,
    connection_succeeded: false,
    inbox_exists: false,
    protocol: null // New field
  };
}

async function testSmtpConnection(mxRecords, email) {
  for (const record of mxRecords) {
    try {
      const result = await testInboxOnServer(record.exchange, email);
      if (result.connection_succeeded) {
        return result;
      }
    } catch (error) {
      console.error(`Error testing inbox for ${email} on ${record.exchange}:`, error);
    }
  }
  return null;
}

async function testCatchAll(exchange, domain) {
  try {
    const randomEmail = `${randomBytes(20).toString("hex")}@${domain}`;
    const testCatchAll = await testInboxOnServer(exchange, randomEmail);
    return testCatchAll.inbox_exists;
  } catch (error) {
    console.error(`Error during catch-all test for ${domain}:`, error);
    return false;
  }
}