 import { Link } from 'react-router-dom'

function AboutMe() {
  return (
    <div className=' bg-red-500 p-5 m-5'>
      <h1 className='text-3xl font-bold'>About Me</h1>
      <Link to="/">Home</Link>
    </div>
  )
}

export default AboutMe
