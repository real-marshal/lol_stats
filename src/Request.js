class Request extends Promise {

  constructor(func, url) {
        let _resolve, _reject
        super((resolve, reject) => {
            _reject = reject
            _resolve = resolve
            func(resolve, reject)
        })
        this.reject = _reject
        this.resolve = _resolve
        this.url = url
  }

  static create(url) {
      return new Request((resolve, reject) => 1, url);
  }

  execute(axiosInstance) {
    axiosInstance
      .get(this.url)
      .then(res => this.resolve(res))
      .catch(err => this.reject(err))
  }
}

module.exports = Request
