const masuk = (req, res, next) => {
    console.log(`Request Masuk: ${req.method} ${req.url}`)
    if (req.method !== 'GET') {
        console.log(` Body:`, req.body)
    }
    next()
}

export default masuk