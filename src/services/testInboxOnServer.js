import net from "net";
import dns from "dns";

const SMTPStageNames = {
  CHECK_CONNECTION_ESTABLISHED: "CHECK_CONNECTION_ESTABLISHED",
  SEND_EHLO: "SEND_EHLO",
  SEND_HELO: "SEND_HELO",
  SEND_MAIL_FROM: "SEND_MAIL_FROM",
  SEND_RECIPIENT_TO: "SEND_RECIPIENT_TO",
  CLOSING: "CLOSING",
};

export const TTestInboxResult = {
  connection_succeeded: false,
  inbox_exists: false,
  protocol: null,
  error: null,
  tempError: false,
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getVerifiableDomain = async () => {
  const customDomain = process.env.CUSTOM_DOMAIN;

  try {
    await dns.promises.lookup(customDomain);

    return customDomain;
  } catch (error) {
    console.error(`Error resolving ${customDomain}: ${error.message}`);
    console.log("Falling back to localhost");
    return "localhost";
  }
};

export const testInboxOnServer = async (smtpHostName, emailInbox) => {
  const result = { ...TTestInboxResult };
  const verifiableDomain = await getVerifiableDomain();

  try {
    await connectAndTest(
      smtpHostName,
      emailInbox,
      result,
      true,
      verifiableDomain
    );
  } catch (error) {
    console.log("EHLO attempt failed, trying HELO after a short delay");
    await delay(1000);
    try {
      await connectAndTest(
        smtpHostName,
        emailInbox,
        result,
        false,
        verifiableDomain
      );
    } catch (error) {
      console.error("Both EHLO and HELO attempts failed");
      result.error = "Failed to connect to SMTP server: " + error.message;
    }
  }

  return result;
};

const connectAndTest = (
  smtpHostName,
  emailInbox,
  result,
  useEHLO,
  verifiableDomain
) => {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(25, smtpHostName);
    let currentStageName = SMTPStageNames.CHECK_CONNECTION_ESTABLISHED;
    let hasQuit = false;

    socket.setTimeout(10000);

    socket.on("timeout", () => {
      console.error("Connection timed out");
      result.error = "Connection timed out";
      closeConnection();
    });

    socket.on("data", (data) => {
      const response = data.toString();
      console.log("<--" + response);

      if (currentStageName === SMTPStageNames.CLOSING) {
        if (response.startsWith("221")) {
          console.log("Connection closed gracefully");
        } else {
          console.log("Unexpected closing response:", response);
        }
        socket.end();
        return resolve(result);
      }

      switch (currentStageName) {
        case SMTPStageNames.CHECK_CONNECTION_ESTABLISHED: {
          const expectedReplyCode = "220";
          const nextStageName = useEHLO
            ? SMTPStageNames.SEND_EHLO
            : SMTPStageNames.SEND_HELO;
          const command = useEHLO
            ? `EHLO ${verifiableDomain}\r\n`
            : `HELO ${verifiableDomain}\r\n`;

          if (!response.startsWith(expectedReplyCode)) {
            console.error("Unexpected response:", response);
            result.error = "Unexpected server response";
            return closeConnection();
          }

          result.connection_succeeded = true;
          sendCommand(command, nextStageName);
          break;
        }
        case SMTPStageNames.SEND_EHLO:
        case SMTPStageNames.SEND_HELO: {
          if (response.startsWith("250")) {
            result.protocol = useEHLO ? "ESMTP" : "SMTP";
            const nextStageName = SMTPStageNames.SEND_MAIL_FROM;
            const command = `MAIL FROM:<noreply@${verifiableDomain}>\r\n`;
            sendCommand(command, nextStageName);
          } else {
            console.error(`${useEHLO ? "EHLO" : "HELO"} failed:`, response);
            result.error = `${useEHLO ? "EHLO" : "HELO"} command failed`;
            return closeConnection();
          }
          break;
        }
        case SMTPStageNames.SEND_MAIL_FROM: {
          const expectedReplyCode = "250";
          const nextStageName = SMTPStageNames.SEND_RECIPIENT_TO;
          const command = `RCPT TO:<${emailInbox}>\r\n`;

          if (!response.startsWith(expectedReplyCode)) {
            console.error("Unexpected response:", response);
            result.error = "MAIL FROM command failed";
            return closeConnection();
          }

          sendCommand(command, nextStageName);
          break;
        }
        case SMTPStageNames.SEND_RECIPIENT_TO: {
          if (response.startsWith("250")) {
            result.inbox_exists = true;
          } else if (response.startsWith("550") || response.startsWith("553")) {
            result.inbox_exists = false;
            console.log(`Email ${emailInbox} was rejected, not a catch-all.`);
          } else if (
            response.startsWith("450") ||
            response.startsWith("451") ||
            response.startsWith("452")
          ) {
            result.tempError = true;
            result.error = "Temporary error, try again later";
            console.log(
              `Temporary error for ${emailInbox}: ${response.trim()}`
            );
          } else {
            console.error("Unexpected response:", response);
            result.error = "Unexpected response to RCPT TO command";
          }

          closeConnection();
        }
      }
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
      result.error = "Socket error: " + error.message;
      reject(error);
      closeConnection();
    });

    socket.on("connect", () => {
      console.log("Connected to:", smtpHostName);
    });

    function sendCommand(command, nextStage) {
      socket.write(command, () => {
        console.log("-->" + command);
        currentStageName = nextStage;
      });
    }

    function closeConnection() {
      if (!hasQuit) {
        hasQuit = true;
        currentStageName = SMTPStageNames.CLOSING;
        sendCommand("QUIT\r\n", SMTPStageNames.CLOSING);
      } else {
        socket.end();
        resolve(result);
      }
    }
  });
};
