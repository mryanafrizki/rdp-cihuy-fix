/**
 * Generate a bash script to set root password and enable SSH
 */
function setRootPasswordScript(password) {
  return `#!/bin/bash
echo root:${password} | sudo chpasswd root
sudo sed -i "s/^.*PermitRootLogin.*/PermitRootLogin yes/g" /etc/ssh/sshd_config
sudo sed -i "s/^.*PasswordAuthentication.*/PasswordAuthentication yes/g" /etc/ssh/sshd_config
sudo systemctl restart sshd
`;
}

module.exports = setRootPasswordScript;

