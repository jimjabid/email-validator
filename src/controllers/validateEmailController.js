import { verifyEmailFormat } from "../services/verifyEmailFormat.js";
import { resolveMxRecords } from "../services/resolveMxRecords.js";
import { testInboxOnServer } from "../services/testInboxOnServer.js";
import { randomBytes } from "crypto";

export const validateEmail = async (req, res) => {
  try {
    if (!req.body?.email) {
      return res.status(400).json({ error: "missing email" });
    }

    const emailFormatIsvalid = verifyEmailFormat(req.body.email);

    if (!emailFormatIsvalid) {
      return res.status(400).json({ error: "email format is invalid" });
    }

    const [, domain] = req.body.email.split("@");

    const mxRecords = await resolveMxRecords(domain);
    const sortedMxRecords = mxRecords.sort((a, b) => a.priority - b.priority);

    if (sortedMxRecords.length === 0) {
      return res.status(400).json({ error: "No MX records found for domain" });
    }

    let smtpResult;
    let hostIndex = 0;

    while (hostIndex < sortedMxRecords.length) {
      try {
        smtpResult = await testInboxOnServer(
          sortedMxRecords[hostIndex].exchange,
          req.body.email
        );

        if (!smtpResult.connection_succeeded) {
          hostIndex++;
        } else if (smtpResult.tempError) {
          // If it's a temporary error, we don't try the next MX record
          break;
        } else {
          break;
        }
      } catch (error) {
        console.error("Error testing inbox:", error);
        hostIndex++;
      }
    }

    if (!smtpResult || !smtpResult.connection_succeeded) {
      return res
        .status(500)
        .json({ error: "Failed to connect to SMTP server" });
    }

    let usesCatchAll = false;

    if (!smtpResult.tempError) {
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
        console.error("Error during catch-all test:", error);
        usesCatchAll = false;
      }
    }

    const response = {
      email_format_is_valid: emailFormatIsvalid,
      uses_catch_all: usesCatchAll,
      protocol: smtpResult.protocol,
      ...smtpResult,
    };

    if (smtpResult.tempError) {
      response.message =
        "Temporary error occurred. The email might be valid, but we couldn't confirm it at this time.";
    }

    res.json(response);
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
