/**
 * core/model/build.js
 * Mongoose schema for builds
 *
 * @exports {Object} default {
 *   {Object} buildSchema - Mongoose schema for build model
 * }
 */

import Mongoose from 'mongoose'
import Promise from 'bluebird'

import { Config, Log } from '~/app'

// TODO: move jenkins to superagent
const jenkins = (Config.jenkins)
  ? require('then-jenkins')(Config.jenkins.url)
  : null

const BuildSchema = new Mongoose.Schema({
  dist: {
    type: String,
    required: true
  },
  arch: {
    type: String,
    required: true
  },

  build: Number,
  log: String,
  status: {
    type: String,
    default: 'QUEUE',
    enum: ['QUEUE', 'BUILD', 'FAIL', 'FINISH']
  },

  started: {
    type: Date,
    default: new Date()
  },
  finished: Date
})

BuildSchema.methods.getCycle = function () {
  return this.model('cycle').findOne({builds: this._id})
}

BuildSchema.methods.getProject = async function () {
  const cycle = await this.getCycle()

  if (cycle == null) {
    return Promise.reject("Unable to find build's cycle")
  }

  return cycle.getProject()
}

// TODO: no services in models!
BuildSchema.methods.doBuild = async function () {
  const cycle = await this.getCycle()
  const project = await this.getProject()

  if (Config.jenkins) {
    return jenkins.job.build({
      name: Config.jenkins.job,
      parameters: {
        PACKAGE: project.package.name,
        REPO: cycle.getRepo(),
        VERSION: cycle.getVersion(),
        DIST: this.dist,
        ARCH: this.arch,
        REFERENCE: cycle.getTag(),
        BUILD: this._id
        // TODO: application changelog
      }
    })
    .then(build => this.update({ build }))
    .catch(err => Log.error(err))
  } else {
    Log.info('Jenkins has been disabled in configuration file. No build is running')
    return Promise.resolve()
  }
}

BuildSchema.methods.getLog = function () {
  if (Config.jenkins) {
    return jenkins.build.log(Config.jenkins.job, this.build)
    .then(log => this.update({ log }))
  }

  return Promise.resolve('Logs disabled in configuration file')
  .then(log => this.update({ log }))
}

// Mongoose lifecycle functions
BuildSchema.post('save', build => {
  build.doBuild()
})

const Build = Mongoose.model('build', BuildSchema)

export default { Build, BuildSchema }
