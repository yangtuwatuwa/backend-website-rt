export function responseSucces(statusCode, message, quote,res ,token = null){
    const response = {
        response : statusCode,
        output: {
            pesan: message,
            token: token 
        },
        message: quote
    }
    res.json(response)
}