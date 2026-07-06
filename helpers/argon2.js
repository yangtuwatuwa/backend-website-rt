import argon2, { hash } from "argon2";


export async function argonhash(inputPassword) {

    try {
        const hash= await argon2.hash(inputPassword, {
            type:argon2.argon2id,
            memoryCost: 2 ** 17,
            timeCost:4,
            parallelism: 2
        })
        
            return hash    
    } catch (err) {
        console.log( err )
    }
}

export async function argonverify(password) {
    try {
        const hashpass = await argonhash()
        const rehash = await argon2.verify(hashpass, password )
        if (rehash) {
            console.log("cekring")
            return true
        } else {
            console.log("tetot...");
            return false
        }
    } catch (err) {
        console.log("helpers say: "+ err);
        return "salahhh"
    }
}
