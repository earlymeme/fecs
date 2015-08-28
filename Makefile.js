/**
 * @file Build file
 * @author Fental<fengeeker@gmail.com>
 */

'use strict';

require('shelljs/make');

var nodeCLI = require('shelljs-nodecli');

var TEMP_DIR = './tmp/';
var BUILD_DIR = './build/';

(function () {
    var path = require('path');

    /**
     * from eslint
     * Generates a function that matches files with a particular extension.
     *
     * @param {string} extension The file extension (i.e. "js")
     * @return {Function} The function to pass into a filter method.
     */
    function fileType(extension) {
        return function (filename) {
            return filename.substring(filename.lastIndexOf('.') + 1) === extension;
        };
    }

    /**
     * Generates a static file that includes each rule by name rather than dynamically
     * looking up based on directory. This is used for the browser version of ESLint.
     *
     * @param {string} basedir The directory in which to look for code.
     */
    function generateRulesIndex(basedir) {
        var output = 'module.exports = function() {\n';
        output += '    var rules = Object.create(null);\n';

        find(basedir + 'rules/').filter(fileType('js')).forEach(function (filename) {
            var basename = path.basename(filename, '.js');
            output += '    rules[\"' + basename + '\"] = require(\"./rules/' + basename + '\");\n';
        });

        output += '\n    return rules;\n};';
        output.to(BUILD_DIR + 'load-rules.js');
    }

    function generateOwnRulesModule(basedir) {
        var fs = require('fs');
        var output = ''
            + 'var rules = require(\'eslint/lib/rules\');\n'
            + 'var util = require(\'eslint/lib/util\');\n'
            + 'var path = require(\'path\');\n'
            + 'exports.register = function () {\n';

        var reg = /([^\\\/]+)\.js$/i;

        fs.readdirSync(basedir).forEach(function (file) {
            if (file.indexOf('index') !== -1) {
                return;
            }

            var match = file.match(reg);
            if (match) {
                var key = 'fecs-' + match[1].replace(/[A-Z]/g, function (a) {
                    return '-' + a.toLowerCase();
                });

                output += '    rules.define([\'' + key + '\'], require(\'./' + file + '\'));\n';
            }
        });

        output += '};\n\n';

        output += ''
            + 'var registered = Object.create(null);\n'
            + 'exports.registerPlugins = function (plugins) {\n'
            + '    if (!Array.isArray(plugins)) {\n'
            + '        return;\n'
            + '    }\n\n'
            + '    plugins.forEach(function (pluginName) {\n'
            + '        var pluginNamespace = util.getNamespace(pluginName);\n'
            + '        var pluginNameWithoutNamespace = util.removeNameSpace(pluginName);\n'
            + '        var pluginNameWithoutPrefix = util.removePluginPrefix(pluginNameWithoutNamespace);\n'
            + '        if (registered[pluginNameWithoutPrefix]) {\n'
            + '            return;\n'
            + '        }\n'
            + '        var plugin = require(pluginNamespace + util.PLUGIN_NAME_PREFIX + pluginNameWithoutPrefix);\n'
            + '        if (plugin.rules) {\n'
            + '            rules.import(plugin.rules, pluginNameWithoutPrefix);\n'
            + '        }\n'
            + '        registered[pluginNameWithoutPrefix] = plugin;\n'
            + '    });\n'
            + '};';
        output.to(BUILD_DIR + 'rules/index.js');
    }

    function generateJSChecker(tmpl, configFile) {
        var fs = require('fs');

        function parseTmpl(tmpl, options) {
            var reg = /{{(\w+)}}/;
            // console.log(options);
            var result = tmpl.replace(reg, function (value) {
                return options[value.match(reg)[1]];
            });
            return result;
        }

        var output = fs.readFileSync(tmpl).toString();

        var config = fs.readFileSync(configFile).toString();

        output = parseTmpl(output, {
            config: config
        });

        output.to(BUILD_DIR + 'checker.js');
    }

    /* eslint-disable no-undef */
    target.browserify = function () {
        // 1. 创建 temp 和 build 目录
        if (!test('-d', TEMP_DIR)) {
            mkdir(TEMP_DIR);
        }
        if (!test('-d', BUILD_DIR)) {
            mkdir(BUILD_DIR);
        }

        mkdir(BUILD_DIR + 'rules');
        // 2. 复制 lib 下的文件进入 tmp 目录
        cp('-r', 'lib/*', TEMP_DIR);

        // 3. 删除需要 fs 模块的目录
        // TODO 其实可以试着将这些地方 -t brfs 转换..
        // TODO 否定上面的TODO，brfs 灵活性太差了...
        generateRulesIndex('./node_modules/eslint/lib/');
        generateOwnRulesModule('./lib/js/rules/');
        generateJSChecker('./tmpl/checker.md', TEMP_DIR + 'js/eslint.json');

        // 4. 将源文件改名
        mv('./node_modules/eslint/lib/load-rules.js', './node_modules/eslint/lib/load-rules-tmp.js');
        rm(TEMP_DIR + 'js/rules/index.js');
        rm(TEMP_DIR + 'js/checker.js');

        // 5. 将生成的文件移至相应目录，（node_modules/eslint/lib/ lib/js/ lib/js/rules/）
        mv(BUILD_DIR + 'load-rules.js', './node_modules/eslint/lib/load-rules.js');
        mv(BUILD_DIR + 'rules/index.js', TEMP_DIR + 'js/rules/index.js');
        mv(BUILD_DIR + 'checker.js', TEMP_DIR + 'js/checker.js');

        // 6. browserify jschecker
        nodeCLI.exec('browserify', TEMP_DIR + 'js/checker.js', '-o', BUILD_DIR + 'jschecker.js', '-s jschecker');

        nodeCLI.exec('browserify', '-r espree', '-o', TEMP_DIR + 'espree.js');

        nodeCLI.exec('browserify', '-r babel-eslint', '-o', TEMP_DIR + 'babel-eslint.js');

        // 7. browserify babel-eslint 和 espree （ eslint 中 parse 通过 require('options')，所以browserify）
        // cat(BUILD_DIR + 'babel-eslint.js', BUILD_DIR + "espree.js").to(BUILD_DIR + 'espree.js');
        // cat(BUILD_DIR + "babel-eslint.js", BUILD_DIR + "jschecker.js").to(BUILD_DIR + "jschecker.js");
        cat(TEMP_DIR + 'espree.js', BUILD_DIR + 'jschecker.js').to(BUILD_DIR + 'jschecker.js');

        rm('-r', TEMP_DIR);
        rm('-r', BUILD_DIR + 'rules');
        rm('-f', './node_modules/eslint/lib/load-rules.js');

        mv('./node_modules/eslint/lib/load-rules-tmp.js', './node_modules/eslint/lib/load-rules.js');

    //
    // 8. 删除多余文件，可以试试压缩看看
    };

})();
