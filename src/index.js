import dns from "dns";
import { resolve } from "path";
import net from "net";

async function validateEmail(email) {
  const domain = email.split("@")[1];

  return new Promise((resolve, reject) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err || addresses.length === 0) {
        return reject(`No MX record found for domain ${domain}`);
      }

      //const mailServer = addresses[0].exchange; //uses the first Mx record wich is the mailserver
      const mailServers = addresses.forEach(record => console.log(`${record.exchange} with Priority ${record.priority}`))

      const mailServer=  addresses.sort((a, b) => a.priority - b.priority);

       console.log(`First highest priority mail server for ${domain}: ${mailServer[0].exchange}`); // Log the mail server

        resolve(mailServers); // Resolve with the mail server

    //   const client = new net.Socket();

    //   client.connect(25, mailServer, () => {
    //     client.write("EHLO ltmsolutions2@gmail.com\r\n");
    //     client.write("MAIL FROM:<ltmsolutions2@gmail.com>\r\n");
    //     client.write(`RCPT TO:<${email}>\r\n`);
    //     client.write("QUIT\r\n");
    //   });

    //   client.on("data", (data) => {
    //     const response = data.toString();
    //     if (response.startsWith("250")) {
    //       resolve(`Email ${email} appears to be valid`);
    //     } else {
    //       resolve(`Email ${email} appears to be Invalid`);
    //     }
    //   });

    //   client.on('error', (err)=>{
    //     reject(`Error connecting to mail server: ${err.message}`)
    //   })

    //   client.on('close',()=> {
    //     console.log('connection closed')
    //   })
    });
  });
}

// Example usage
validateEmail("jabidandresjimenezserrano@gmail.com")
    // .then(result => console.log(result))
    // .catch(error => console.error(error));

.then(mailServers => mailServers)
  .catch(error => console.error(error));
