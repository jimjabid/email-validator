import net from "net";

const SMTPStageNames = {
  CHECK_CONNECTION_ESTABLISHED: "CHECK_CONNECTION_ESTABLISHED",
  SEND_EHLO: "SEND_EHLO",
  SEND_MAIL_FROM: "SEND_MAIL_FROM",
  SEND_RECIPIENT_TO: "SEND_RECIPIENT_TO",
  CLOSING: "CLOSING",
};

export const TTestInboxResult = {
  connection_succeeded: false,
  inbox_exists: false,
};

export const testInboxOnServer = async (smtpHostName, emailInbox) => {
  return new Promise((resolve, reject) => {
    const result = { ...TTestInboxResult };
    const socket = net.createConnection(25, smtpHostName);
    let currentStageName = SMTPStageNames.CHECK_CONNECTION_ESTABLISHED;
    let hasQuit = false;

    socket.setTimeout(10000); // 10 second timeout

    socket.on("timeout", () => {
      console.error("Connection timed out");
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
          const nextStageName = SMTPStageNames.SEND_EHLO;
          const command = `EHLO mail.example.org\r\n`;

          if (!response.startsWith(expectedReplyCode)) {
            console.error("Unexpected response:", response);
            return closeConnection();
          }

          result.connection_succeeded = true;
          sendCommand(command, nextStageName);
          break;
        }
        case SMTPStageNames.SEND_EHLO: {
          const expectedReplyCode = "250";
          const nextStageName = SMTPStageNames.SEND_MAIL_FROM;
          const command = `MAIL FROM:<name@example.org>\r\n`;

          if (!response.startsWith(expectedReplyCode)) {
            console.error("Unexpected response:", response);
            return closeConnection();
          }

          sendCommand(command, nextStageName);
          break;
        }
        case SMTPStageNames.SEND_MAIL_FROM: {
          const expectedReplyCode = "250";
          const nextStageName = SMTPStageNames.SEND_RECIPIENT_TO;
          const command = `RCPT TO:<${emailInbox}>\r\n`;

          if (!response.startsWith(expectedReplyCode)) {
            console.error("Unexpected response:", response);
            return closeConnection();
          }

          sendCommand(command, nextStageName);
          break;
        }
        case SMTPStageNames.SEND_RECIPIENT_TO: {
          if (response.startsWith("250")) {
            result.inbox_exists = true;
          } else if (response.startsWith("550")) {
            result.inbox_exists = false;
            console.log(`Email ${emailInbox} was rejected, not a catch-all.`);
          } else {
            console.error("Unexpected response:", response);
          }

          closeConnection();
        }
      }
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
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