import app from './app'

const port = Number(process.env.API_PORT || 3333)

app.listen(port, () => {
  console.log(`API local em http://localhost:${port}`)
})
