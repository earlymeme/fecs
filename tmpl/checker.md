/**
 * @file eslint checker
 * @author chris<wfsr@foxmail.com>
 */

var eslint = require('eslint/lib/eslint');

var rules = require('./rules');

var Checker = function (options) {
    this.options = options;
};

// 这里也可以抽取出来
var checker = new Checker({
    name: 'eslint',
    type: 'js',
    suffix: 'js,es6',
    ignore: 'm.js,min.js'
});

/**
 * 注册自定义规则
 *
 */
checker.register = function () {
    rules.register();
};

/**
 * 执行对 JS 文件内容的检查
 *
 * @param {string} contents 文件内容
 * @param {string} path 文件路径
 * @param {Object} cliOptions 命令行中传过来的配置项
 * @return {Array.<Object>} 返回错误信息的数组
 */
checker.check = function (contents, path, cliOptions) {

    this.register();

    var options = this.options;
    var name = options.name;
    var type = options.type;

    var config = {{config}};
    
    var errors = [];

    rules.registerPlugins(config.plugins);

    // 检查的地方也可以抽出来
    try {
        eslint.verify(contents.replace(/\r\n?/g, '\n'), config).some(function (error) {
            if (typeof error.column === 'number') {
                error.column++;
            }

            errors.push(
                error
            );
        });
    }
    catch (error) {
        errors.push(
            []
        );
    }

    return errors;
};

module.exports = checker;
