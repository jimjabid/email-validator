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
      return res
        .status(400)
        .json({ error: "maximum 100 emails allowed per request" });
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
      return createEmailResult(email, false, "Invalid email format");
    }

    const [, domain] = email.split("@");
    const mxRecords = await resolveMxRecords(domain);
    const sortedMxRecords = mxRecords.sort((a, b) => a.priority - b.priority);

    if (sortedMxRecords.length === 0) {
      return createEmailResult(
        email,
        emailFormatIsValid,
        "No MX records found"
      );
    }

    const smtpResult = await testSmtpConnectionParallel(sortedMxRecords, email);

    if (!smtpResult.connection_succeeded) {
      return createEmailResult(
        email,
        emailFormatIsValid,
        smtpResult.error || "Failed to connect to SMTP server"
      );
    }

    const finalResult = await validateEmailWithCatchAll(
      sortedMxRecords[0].exchange,
      email
    );

    return {
      email,
      email_format_is_valid: emailFormatIsValid,
      ...finalResult,
    };
  } catch (error) {
    console.error(`Error validating email ${email}:`, error);
    return createEmailResult(
      email,
      false,
      "Failed to validate email: " + error.message
    );
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
  };
}

async function testSmtpConnectionParallel(mxRecords, email, timeout = 10000) {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          connection_succeeded: false,
          error: "Connection timeout",
        });
      }
    }, timeout);

    Promise.any(
      mxRecords.map((record) =>
        testInboxOnServer(record.exchange, email).then((result) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(result);
          }
        })
      )
    ).catch(() => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          connection_succeeded: false,
          error: "Failed to connect to any SMTP server",
        });
      }
    });
  });
}

function generateRandomEmail(domain) {
  return `${randomBytes(8).toString("hex")}@${domain}`;
}

async function validateEmailWithCatchAll(exchange, email) {
  // First, check if the original email exists
  const originalResult = await testInboxOnServer(exchange, email);

  // If the original email doesn't exist, no need to check for catch-all
  if (!originalResult.inbox_exists) {
    return originalResult;
  }

  // If the original email exists, test for catch-all
  const [, domain] = email.split("@");
  const randomEmail = generateRandomEmail(domain);
  const randomResult = await testInboxOnServer(exchange, randomEmail);

  return {
    ...originalResult,
    uses_catch_all: randomResult.inbox_exists,
  };
}
