/**
 * Generate a random password
 * Format: 3 uppercase, 3 lowercase, 3 digits mixed
 */
function passwordGenerator() {
  const uppercase = 'QWERTYUIOPASDFGHJKLZXCVBNM';
  const lowercase = 'qwertyuiopasdfghjklzxcvbnm';
  const digits = '1234567890';

  let password = '';
  
  for (let i = 0; i < 3; i++) {
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += digits[Math.floor(Math.random() * digits.length)];
  }

  return password;
}

module.exports = passwordGenerator;

