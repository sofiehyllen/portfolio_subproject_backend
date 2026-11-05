export async function hashPassword(pswd: string): Promise<string> {

    // TO DO finish function that hashes password
    // waiting until lecture about safety is finished
    return pswd;
}

export async function checkPassword(pswd: string, hash: string): Promise<boolean> {
    const hashedPswd = await hashPassword(pswd);
    return hash === hashedPswd;
}