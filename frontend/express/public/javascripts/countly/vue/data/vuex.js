/* global Vue, _, countlyGlobal, CV, Promise */

(function(countlyVue) {


    var _capitalized = function(prefix, str) {
        return prefix + str[0].toUpperCase() + str.substring(1);
    };

    var VuexModule = function(name, options) {

        options = options || {};

        var namespaced = options.namespaced !== false,
            submodules = options.submodules;

        var mutations = options.mutations || {},
            actions = options.actions || {},
            getters = options.getters || {};

        var _resetFn = function() {
            if (options.state) {
                return options.state();
            }
            return {};
        };

        var module = {
            namespaced: namespaced,
            state: _resetFn(),
            getters: getters,
            mutations: mutations,
            actions: actions
        };

        var resetKey = '',
            resetStateKey = '';

        if (!namespaced) {
            resetStateKey = _capitalized("reset", name + "State");
            resetKey = _capitalized("reset", name);
        }
        else {
            resetStateKey = "resetState";
            resetKey = "reset";
        }

        var ref = {
            name: name,
            module: module,
            _resetKey: resetKey,
            _parent: null
        };

        mutations[resetStateKey] = function(state) {
            var newState = _resetFn();
            Object.keys(newState).forEach(function(key) {
                state[key] = newState[key];
            });
        };

        actions[resetKey] = function(context, params) {
            context.commit(resetStateKey);
            params = params || {};
            var deep = params.deep !== false;

            if (submodules && deep) {
                var path = params._path,
                    currentPath = '';

                if (!path) {
                    var currentParent = ref._parent;
                    currentPath = name;
                    while (currentParent) {
                        currentPath = currentParent.name + "/" + currentPath;
                        currentParent = currentParent._parent;
                    }
                }
                else {
                    currentPath = path + "/" + name;
                }

                submodules.forEach(function(submodule) {
                    if (submodule.module.namespaced) {
                        var subReset = currentPath + "/" + submodule.name + "/reset";
                        context.dispatch(subReset, { deep: true, _path: currentPath }, {root: true});
                    }
                    else {
                        context.dispatch(submodule._resetKey, { deep: true, _path: currentPath });
                    }
                });
            }
        };

        if (submodules) {
            module.modules = {};
            submodules.forEach(function(submodule) {
                module.modules[submodule.name] = submodule.module;
                submodule._parent = ref;
            });
        }

        return ref;
    };

    var _dataTableAdapters = {
        toLegacyRequest: function(requestParams, cols) {
            var convertedParams = {};
            convertedParams.iDisplayStart = (requestParams.page - 1) * requestParams.perPage;
            convertedParams.iDisplayLength = requestParams.perPage;
            if (cols && requestParams.sort && requestParams.sort.length > 0) {
                var sorter = requestParams.sort[0];
                var sortFieldIndex = cols.indexOf(sorter.field);
                if (sortFieldIndex > -1) {
                    convertedParams.iSortCol_0 = sortFieldIndex;
                    convertedParams.sSortDir_0 = sorter.type;
                }
            }
            if (requestParams.searchQuery) {
                convertedParams.sSearch = requestParams.searchQuery;
            }
            return convertedParams;
        },
        toStandardResponse: function(response, requestOptions) {
            response = response || {};
            requestOptions = requestOptions || {};

            var reservedFields = {
                "aaData": true,
                "iTotalDisplayRecords": true,
                "iTotalRecords": true,
                "sEcho": true
            };

            var fields = {
                rows: response.aaData || [],
                totalRows: response.iTotalDisplayRecords || 0,
                notFilteredTotalRows: response.iTotalRecords || 0
            };
            if (Object.prototype.hasOwnProperty.call(response, "sEcho")) {
                fields.echo = parseInt(response.sEcho, 10);
            }

            Object.keys(response).forEach(function(respKey) {
                if (!reservedFields[respKey] && !Object.prototype.hasOwnProperty.call(fields, respKey)) {
                    fields[respKey] = response[respKey];
                }
            });

            if (Object.prototype.hasOwnProperty.call(requestOptions, "url")) {
                var pairs = [];
                for (var dataKey in requestOptions.data) {
                    if (dataKey === "iDisplayStart" || dataKey === "iDisplayLength") {
                        continue;
                    }
                    pairs.push(dataKey + "=" + requestOptions.data[dataKey]);
                }
                pairs.push("api_key=" + countlyGlobal.member.api_key);

                fields.exportSettings = {
                    resourcePath: requestOptions.url + "?" + pairs.join("&"),
                    resourceProp: "aaData"
                };
            }
            return fields;
        }
    };

    var ServerDataTable = function(name, options) {
        var getters = {},
            mutations = {},
            actions = {},
            lastResponseField = "lastResponse",
            counterField = "requestCounter",
            echoField = "requestLastEcho",
            paramsField = "params",
            statusField = "status",
            resourceName = name,
            statusKey = _capitalized(name, statusField),
            counterKey = _capitalized(name, counterField),
            paramsKey = _capitalized(name, paramsField);

        var state = function() {
            var stateObj = {};
            stateObj[lastResponseField] = _dataTableAdapters.toStandardResponse();
            stateObj[counterField] = 0;
            stateObj[statusField] = "ready";
            stateObj[echoField] = 0;
            stateObj[paramsField] = {
                ready: false
            };
            return stateObj;
        };

        //
        getters[name] = function(_state) {
            return _state[lastResponseField];
        };
        getters[statusKey] = function(_state) {
            return _state[statusField];
        };

        //
        mutations[_capitalized("set", resourceName)] = function(_state, newValue) {
            _state[lastResponseField] = newValue;
            _state[statusField] = "ready";
            _state[echoField] = newValue.echo || 0;
        };

        mutations[_capitalized("set", paramsKey)] = function(_state, newValue) {
            _state[paramsField] = newValue;
        };

        mutations[_capitalized("increment", counterKey)] = function(_state) {
            _state[counterField]++;
        };

        mutations[_capitalized("set", statusKey)] = function(_state, newValue) {
            _state[statusField] = newValue;
        };

        //
        actions[_capitalized("fetch", resourceName)] = function(context, actionParams) {
            var promise = null,
                requestParams = context.state[paramsField],
                requestOptions = options.onRequest(context, actionParams);

            if (!requestParams.ready || !requestOptions) {
                promise = Promise.resolve();
            }
            else {
                var legacyOptions = _dataTableAdapters.toLegacyRequest(requestParams, options.columns);
                legacyOptions.sEcho = context.state[counterField];
                _.extend(requestOptions.data, legacyOptions);
                if (actionParams && actionParams._silent === false) {
                    context.commit(_capitalized("set", statusKey), "pending");
                }
                else {
                    context.commit(_capitalized("set", statusKey), "silent-pending");
                }
                promise = CV.$.ajax(requestOptions, { disableAutoCatch: true });
                context.commit(_capitalized("increment", counterKey));
            }
            return promise
                .then(function(res) {
                    if (!res) {
                        return;
                    }
                    var convertedResponse = _dataTableAdapters.toStandardResponse(res, requestOptions);
                    if (!Object.prototype.hasOwnProperty.call(convertedResponse, "echo") ||
                        convertedResponse.echo >= context.state[echoField]) {
                        if (typeof options.onReady === 'function') {
                            convertedResponse.rows = options.onReady(context, convertedResponse.rows);
                        }
                        context.commit(_capitalized("set", resourceName), convertedResponse);
                    }
                })
                .catch(function() {
                    return context.commit(_capitalized("set", resourceName), _dataTableAdapters.toStandardResponse());
                });
        };

        actions[_capitalized("pasteAndFetch", resourceName)] = function(context, remoteParams) {
            context.commit(_capitalized("set", paramsKey), Object.assign({}, remoteParams, {ready: true}));
            return context.dispatch(_capitalized("fetch", resourceName), { _silent: false });
        };

        return VuexModule(name, {
            namespaced: false,
            state: state,
            getters: getters,
            mutations: mutations,
            actions: actions
        });
    };

    var MutableTable = function(name, options) {
        var _state = function() {
            return {
                trackedFields: options.trackedFields || [],
                patches: {}
            };
        };

        var keyFn = function(row, dontStringify) {
            if (dontStringify) {
                return options.keyFn(row);
            }
            return JSON.stringify(options.keyFn(row));
        };

        var tableGetters = {
            sourceRows: options.sourceRows,
            diff: function(state, getters) {
                if (state.trackedFields.length === 0 || Object.keys(state.patches).length === 0) {
                    return [];
                }
                var diff = [];
                getters.sourceRows.forEach(function(row) {
                    var rowKey = keyFn(row);
                    if (state.patches[rowKey]) {
                        var originalKey = keyFn(row, true);
                        state.trackedFields.forEach(function(fieldName) {
                            if (Object.prototype.hasOwnProperty.call(state.patches[rowKey], fieldName) && row[fieldName] !== state.patches[rowKey][fieldName]) {
                                diff.push({
                                    key: originalKey,
                                    field: fieldName,
                                    newValue: state.patches[rowKey][fieldName],
                                    oldValue: row[fieldName]
                                });
                            }
                        });
                    }
                });
                return diff;
            },
            rows: function(state, getters) {
                if (Object.keys(state.patches).length === 0) {
                    return getters.sourceRows;
                }
                return getters.sourceRows.map(function(row) {
                    var rowKey = keyFn(row);
                    if (state.patches[rowKey]) {
                        return Object.assign({}, row, state.patches[rowKey]);
                    }
                    return row;
                });
            }
        };

        var mutations = {
            patch: function(state, obj) {
                var row = obj.row,
                    fields = obj.fields;

                var rowKey = keyFn(row);
                var currentPatch = Object.assign({}, state.patches[rowKey], fields);

                Vue.set(state.patches, rowKey, currentPatch);
            },
            unpatch: function(state, obj) {
                var row = obj.row,
                    fields = obj.fields;

                var rowKeys = null;
                if (!row) {
                    rowKeys = Object.keys(state.patches);
                }
                else {
                    rowKeys = [keyFn(row)];
                }

                rowKeys.forEach(function(rowKey) {
                    if (!state.patches[rowKey]) {
                        return;
                    }

                    if (!fields) {
                        Vue.delete(state.patches, rowKey);
                    }
                    else {
                        fields.forEach(function(fieldName) {
                            Vue.delete(state.patches[rowKey], fieldName);
                        });
                        if (Object.keys(state.patches[rowKey]).length === 0) {
                            Vue.delete(state.patches, rowKey);
                        }
                    }
                });

            }
        };
        return VuexModule(name, {
            state: _state,
            getters: tableGetters,
            mutations: mutations
        });
    };

    var getServerDataSource = function(storeInstance, path, resourceName) {
        var statusPath = path + "/" + _capitalized(resourceName, 'status'),
            actionPath = path + "/" + _capitalized("pasteAndFetch", resourceName),
            resourcePath = path + "/" + resourceName;

        return {
            fetch: function(params) {
                return storeInstance.dispatch(actionPath, params);
            },
            statusAddress: {
                type: 'vuex-getter',
                store: storeInstance,
                path: statusPath
            },
            dataAddress: {
                type: 'vuex-getter',
                store: storeInstance,
                path: resourcePath
            }
        };
    };

    countlyVue.vuex.Module = VuexModule;
    countlyVue.vuex.MutableTable = MutableTable;
    countlyVue.vuex.ServerDataTable = ServerDataTable;
    countlyVue.vuex.getServerDataSource = getServerDataSource;

}(window.countlyVue = window.countlyVue || {}));