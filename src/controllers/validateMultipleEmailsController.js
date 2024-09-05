import { verifyEmailFormat } from "../services/verifyEmailFormat.js";
import { resolveMxRecords } from "../services/resolveMxRecords.js";
import { testInboxOnServer } from "../services/testInboxOnServer.js";
import { randomBytes } from "crypto";


// ... keep the existing validateEmail function ...

export const validateMultipleEmails = async (req, res) => {
  try {
    if (!Array.isArray(req.body.emails)) {
      return res.status(400).json({ error: "emails must be an array" });
    }

    const emails = req.body.emails;
    
    if (emails.length > 100) {
      return res.status(400).json({ error: "maximum 100 emails allowed per request" });
    }

    const results = await Promise.all(emails.map(async (email) => {
      try {
        return await validateSingleEmail(email);
      } catch (error) {
        console.error(`Error validating email ${email}:`, error);
        return {
          email,
          error: "Failed to validate email",
          email_format_is_valid: false,
          uses_catch_all: false,
          connection_succeeded: false,
          inbox_exists: false
        };
      }
    }));

    res.json(results);
  } catch (error) {
    console.error("Unexpected error in batch validation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

async function validateSingleEmail(email) {
  const emailFormatIsvalid = verifyEmailFormat(email);

  if (!emailFormatIsvalid) {
    return {
      email,
      email_format_is_valid: false,
      uses_catch_all: false,
      connection_succeeded: false,
      inbox_exists: false
    };
  }

  const [, domain] = email.split("@");

  const mxRecords = await resolveMxRecords(domain);
  const sortedMxRecords = mxRecords.sort((a, b) => a.priority - b.priority);

  let smtpResult;
  let hostIndex = 0;

  while (hostIndex < sortedMxRecords.length) {
    try {
      smtpResult = await testInboxOnServer(
        sortedMxRecords[hostIndex].exchange,
        email
      );

      if (!smtpResult.connection_succeeded) {
        hostIndex++;
      } else {
        break;
      }
    } catch (error) {
      console.error(`Error testing inbox for ${email}:`, error);
      hostIndex++;
    }
  }

  if (!smtpResult || !smtpResult.connection_succeeded) {
    return {
      email,
      email_format_is_valid: emailFormatIsvalid,
      uses_catch_all: false,
      connection_succeeded: false,
      inbox_exists: false
    };
  }

  let usesCatchAll = false;

  try {
    const randomEmail = `${randomBytes(20).toString("hex")}@${domain}`;
    const testCatchAll = await testInboxOnServer(
      sortedMxRecords[hostIndex].exchange,
      randomEmail
    );
    
    usesCatchAll = testCatchAll.inbox_exists;
    
    if (!usesCatchAll) {
      console.log(`Domain ${domain} does not use catch-all.`);
    }
  } catch (error) {
    console.error(`Error during catch-all test for ${email}:`, error);
    usesCatchAll = false;
  }

  return {
    email,
    email_format_is_valid: emailFormatIsvalid,
    uses_catch_all: usesCatchAll,
    ...smtpResult
  };
}