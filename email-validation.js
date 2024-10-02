import { SMTPClient } from 'smtp-client';

async function validateEmail(email) {
  const domain = email.split("@")[1];

  // Initialize the SMTP client with the appropriate settings
  let client = new SMTPClient({
    host: `smtp.${domain}`, // Replace with the appropriate SMTP server for the domain
    port: 25,               // Standard SMTP port (can be adjusted if necessary)
    secure: false           // Set to true if you are using a secure connection (e.g., port 465)
  });

  try {
    // Connect to the SMTP server
    await client.connect();
    
    // Greet the server (EHLO or HELO)
    await client.greet({hostname: 'localhost'}); // Replace 'localhost' with your server's hostname if necessary

    // (Optional) Authenticate if required by the server
    // await client.authPlain({username: 'your_username', password: 'your_password'});

    // Specify the sender's email address (can be any valid email address)
    await client.mail({from: 'your-email@example.com'});

    // Specify the recipient's email address
    await client.rcpt({to: email});

    // If we reached this point, the server accepted the recipient's email address
    console.log(`Email ${email} appears to be valid`);

  } catch (err) {
    // If there's an error, the email address might be invalid or there's an issue with the connection
    console.error(`Email ${email} appears to be invalid: ${err.message}`);
  } finally {
    // Ensure the connection is closed
    await client.quit();
  }
}

// Example usage
validateEmail("jabidandresjimenezserrano@gmail.com")
  .catch(console.error);
