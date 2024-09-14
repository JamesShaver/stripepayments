export function GenHash(length) {
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
  
    const charSet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomString = '';
  
    for (let i = 0; i < length; i++) {
      const randomIndex = randomValues[i] % charSet.length;
      randomString += charSet[randomIndex];
    }
  
    return randomString;
  }