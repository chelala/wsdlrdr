(() => {
    'use strict';

    const xmldoc = require('xmldoc');
    const deepmerge = require('deepmerge');
    const fs = require('fs');
    const path = require('path');

    // const cachePath = path.resolve(__dirname, '..', 'cache');
    const os = require('os');
    const cachePath = os.tmpdir();

    function getProtocol (opts = {}) {
        if (!opts.secure) {
            return 'http://';
        }

        return 'https://';
    }

    function doGetRequest (params = {}, opts = {}) {
        if (params.host === undefined || params.path === undefined) {
            throw new Error('insufficient arguments for get');
        }

        if (params.rejectUnauthorized === undefined) {
            params.rejectUnauthorized = true;
        }

        return new Promise((resolve, reject) => {
            (async () => {
                try {
                    const got = await import('got');
                    const response = await got.got(
                        getProtocol(opts) + params.host + params.path,
                        {
                            headers: params.headers || {},
                            https  : {
                                rejectUnauthorized: params.rejectUnauthorized
                            }
                        }
                    );
                    // console.log('statusCode:', response.statusCode);
                    // console.log('body:', response.body);
                    resolve({
                        body  : response.body,
                        response,
                        header: response.headers
                    });
                } catch (error) {
                    // console.log('error:', error);
                    reject(error);
                }
            })();
        });
    }

    function ensureExists (path, mask = '0777') {
        return new Promise((resolve, reject) => {
            fs.mkdir(path, mask, function (err) {
                if (err) {
                    if (err.code === 'EEXIST') resolve();
                    else reject(err);
                } else resolve();
            });
        });
    }

    /**
     * generate cache name
     */
    function getCacheFileName (params) {
        let cacheFileName = params.host + params.wsdl;
        cacheFileName = cacheFileName.replace(/[^a-zA-Z 0-9]+/g, '');
        cacheFileName = encodeURIComponent(cacheFileName);

        return cacheFileName;
    }

    function getNameWithoutNamespace (name) {
        const attr = name.split(':');
        if (attr.length > 1) {
            return attr[1];
        }

        return name;
    }

    function getNamespace (name, suffix) {
        const attr = name.split(':');
        if (attr.length > 1) {
            if (suffix) {
                return attr[0] + ':';
            }

            return attr[0];
        }

        return '';
    }

    function getFormatedAttr (attr) {
        let namespace = '';
        if (attr.type) {
            attr.type = getNameWithoutNamespace(attr.type);
            namespace = getNamespace(attr.type);
        }

        if (attr.element) {
            attr.element = getNameWithoutNamespace(attr.element);
            namespace = getNamespace(attr.element);
        }

        if (namespace.length !== 0) {
            attr.namespace = namespace;
        }

        return attr;
    }

    function getComplexTypeAttrs ($complexType) {
        if ($complexType.children.length === 0) {
            return [];
        }

        let complexTypeName = $complexType.children[0].name;
        if (!complexTypeName) {
            const foundTypeItem = $complexType.children.find(
                (typeItem) => typeItem.name
            );
            if (foundTypeItem) {
                complexTypeName = foundTypeItem.name;
            }
        }
        const schemaStruct = getNamespace(complexTypeName, true);

        const $sequence = $complexType.childNamed(schemaStruct + 'sequence');
        if ($sequence) {
            const sequenceChildrens = $sequence.children.filter(
                (childItem) => childItem.name
            );
            return sequenceChildrens.map(($seqChild) =>
                getFormatedAttr($seqChild.attr)
            );
        }

        return getFormatedAttr($complexType.attr);
    }

    function getMessageAttrs ($message, $wsdl) {
        const wsdlStruct = getNamespace($wsdl.name, true);

        const $types = getWsdlChild($wsdl, 'types', wsdlStruct);
        let typeName = $types.children[0].name;
        if (!typeName) {
            const foundTypeItem = $types.children.find(
                (typeItem) => typeItem.name
            );
            if (foundTypeItem) {
                typeName = foundTypeItem.name;
            }
        }

        const typesStruct = getNamespace(typeName, true);

        const $schema = $types.childNamed(typesStruct + 'schema');
        const $complexTypes = $schema.childrenNamed(
            typesStruct + 'complexType'
        );

        const messageChildrens = $message.children.filter(
            (childItem) => childItem.name
        );
        return messageChildrens.map(($messageChild) => {
            const messageAttr = $messageChild.attr;
            const typeName = getNameWithoutNamespace(
                messageAttr.type || messageAttr.element
            );
            const returnData = {
                name     : messageAttr.name,
                namespace: getNamespace(
                    messageAttr.type || messageAttr.element
                )
            };

            //
            // first look if schema exists
            //

            // is simple type
            const $methodSchema = $schema.childWithAttribute('name', typeName);
            if ($methodSchema) {
                if ($methodSchema.children.length === 0) {
                    return Object.assign(
                        {
                            params: []
                        },
                        returnData,
                        getFormatedAttr($methodSchema.attr)
                    );
                }

                // is complex type
                const $methodComplexType = $methodSchema.childNamed(
                    typesStruct + 'complexType'
                );
                if ($methodComplexType) {
                    return Object.assign({}, returnData, {
                        params: getComplexTypeAttrs($methodComplexType)
                    });
                }
            }

            //
            // search in complex types if exists
            //
            const $complexType = $complexTypes.find(
                ($complexType) => $complexType.attr.name === typeName
            );
            if ($complexType) {
                return Object.assign({}, returnData, {
                    params: getComplexTypeAttrs($complexType)
                });
            }

            //
            // still no results
            // format message attribute and return this
            //

            return Object.assign(
                {
                    params: []
                },
                returnData,
                getFormatedAttr($messageChild.attr)
            );
        });
    }

    function checkCachedFile (fullPath) {
        return new Promise((resolve, reject) => {
            fs.stat(fullPath, (err, fileStats) => {
                if (err) {
                    // no file
                    if (err.code === 'ENOENT') {
                        resolve(true);
                    } else {
                        throw new Error(err);
                    }
                } else {
                    const fileTime = new Date(fileStats.mtime).getTime();
                    if (Date.now() - fileTime >= 84000000) {
                        return resolve(true);
                    }

                    resolve();
                }
            });
        });
    }

    function getCachedWsdl (params, opts) {
        const cacheFileName = getCacheFileName(params);
        const fullPath = path.resolve(__dirname, '..', 'cache', cacheFileName);

        return checkCachedFile(fullPath)
            .then((renew) => {
                if (renew) {
                    return null;
                }

                return new Promise((resolve, reject) => {
                    fs.readFile(fullPath, 'UTF-8', (err, fileData) => {
                        if (err) reject(err);
                        else resolve(fileData);
                    });
                });
            })
            .catch((err) => {
                throw new Error(err);
            });
    }

    function saveWsdlToCache (params, wsdlContent) {
        const cacheFileName = getCacheFileName(params);
        const fullPath = cachePath + path.sep + cacheFileName;

        // write to cache
        return ensureExists(cachePath)
            .then(() => {
                return new Promise((resolve, reject) => {
                    fs.writeFile(fullPath, wsdlContent, (err) => {
                        if (err) reject(err);
                        resolve();
                    });
                });
            })
            .catch((err) => {
                throw new Error(err);
            });
    }

    function getWsdl (params = {}, opts = {}) {
        return getCachedWsdl(params, opts).then((wsdl) => {
            // return cached wsdl if available
            if (wsdl !== null) {
                return wsdl;
            }

            // create a params copy
            const paramsCopy = Object.assign({}, params, {
                path: params.wsdl
            });

            // refresh wsdl, save to cache
            return doGetRequest(paramsCopy, opts).then((res) => {
                if (res.response.statusCode !== 200) {
                    throw new Error(
                        `fail to get wsdl: ${res.response.statusMessage}`
                    );
                }

                const contentType = res.response.headers['content-type'];
                if (
                    contentType.indexOf('xml') === -1 &&
                    contentType.indexOf('wsdl') === -1
                ) {
                    if (
                        opts.failOnWrongContentType === undefined ||
                        opts.failOnWrongContentType === true
                    ) {
                        throw new Error('no wsdl/xml response');
                    } else {
                        console.error('no wsdl/xml as content-type');
                    }
                }

                saveWsdlToCache(params, res.body);
                return res.body;
            });
        });
    }

    function getValFromXmlElement ($xmlElement) {
        const elementName = getNameWithoutNamespace($xmlElement.name);
        if (!elementName) {
            throw new Error('no elementName');
        }

        let childValues = null;
        if ($xmlElement.children && $xmlElement.children.length !== 0) {
            const xmlElementChildrens = $xmlElement.children.filter(
                (xmlItem) => xmlItem.name
            );
            if (xmlElementChildrens.length !== 0) {
                childValues = xmlElementChildrens.reduce(
                    (store, $childItem) => {
                        if (store[elementName]) {
                            const addable = getValFromXmlElement($childItem);
                            if (addable) {
                                if (
                                    Object(store[elementName]) ===
                                    store[elementName]
                                ) {
                                    for (const addKey of Object.keys(addable)) {
                                        if (store[elementName][addKey]) {
                                            if (
                                                !Array.isArray(
                                                    store[elementName][addKey]
                                                )
                                            ) {
                                                store[elementName][addKey] = [
                                                    store[elementName][addKey]
                                                ];
                                            }

                                            store[elementName][addKey].push(
                                                addable[addKey]
                                            );
                                        } else {
                                            store[elementName][addKey] =
                                                addable[addKey];
                                        }
                                    }

                                    return store;
                                }
                            }
                        } else {
                            store[elementName] =
                                getValFromXmlElement($childItem);
                        }

                        return store;
                    },
                    {}
                );
            }
        }

        let response = {};

        const xmlValue = $xmlElement.val.replace(/[\n\r\t]/g, '').trim();

        if (xmlValue.length !== 0) {
            // str.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            response[elementName] = xmlValue;
        }

        // response[elementName] = $xmlElement.val;
        if ($xmlElement.attr && Object.keys($xmlElement.attr).length !== 0) {
            if (response[elementName]) {
                response[elementName] = { value: response[elementName] };
            }
            response[elementName] = Object.assign(
                {},
                response[elementName],
                $xmlElement.attr
            );
        }

        if (childValues) {
            response = deepmerge(response, childValues);
        }

        return response;
    }

    function getWsdlChild ($wsdlObj, name, wsdlStruct) {
        let $child = $wsdlObj.childNamed(wsdlStruct + name);

        // if not found try some default
        if (!$child) {
            $child = $wsdlObj.childNamed('wsdl:' + name);
        }

        return $child;
    }

    const Wsdlrdr = module.exports;

    Wsdlrdr.getXmlDataAsJson = function (xml) {
        const $xmlObj = new xmldoc.XmlDocument(xml);
        const xmlNamespace = getNamespace($xmlObj.name, true);

        let $extractNode = $xmlObj.childNamed(xmlNamespace + 'Body');
        if (!$extractNode) {
            $extractNode = $xmlObj;
        }

        const extractedData = getValFromXmlElement($extractNode);
        if (extractedData.Body) {
            return extractedData.Body;
        }

        return extractedData;
    };

    Wsdlrdr.getNamespaces = function (params, opts) {
        return getWsdl(params, opts).then(function (wsdl) {
            const $wsdlObj = new xmldoc.XmlDocument(wsdl);
            const wsdlObjAttrNames = Object.keys($wsdlObj.attr);
            return wsdlObjAttrNames.reduce((store, attrKey) => {
                const attrNamespace = getNamespace(attrKey);
                const attrName = getNameWithoutNamespace(attrKey);

                // add namespace of attrs to list
                if ($wsdlObj.attr[attrNamespace]) {
                    if (
                        !store.find(
                            (storeItem) => storeItem.short === attrNamespace
                        )
                    ) {
                        store.push({
                            short: attrNamespace,
                            full : $wsdlObj.attr[attrNamespace]
                        });
                    }
                }

                // add namespace to list
                if (attrNamespace.length !== 0) {
                    store.push({
                        short: attrName,
                        full : $wsdlObj.attr[attrKey]
                    });
                }

                return store;
            }, []);
        });
    };

    Wsdlrdr.getMethodParamsByName = function (methodName, params, opts) {
        const getMessageNode = ($messages, nodeName) =>
            $messages.find(
                ($message) =>
                    $message.attr.name === getNameWithoutNamespace(nodeName)
            );

        return getWsdl(params, opts).then(function (wsdl) {
            const $wsdlObj = new xmldoc.XmlDocument(wsdl);
            const wsdlStruct = getNamespace($wsdlObj.name, true);

            // const $binding = $wsdlObj.childNamed(wsdlStruct + 'binding');
            const $portType = $wsdlObj.childNamed(wsdlStruct + 'portType');
            const $messages = $wsdlObj.childrenNamed(wsdlStruct + 'message');

            const $types = getWsdlChild($wsdlObj, 'types', wsdlStruct);

            let typeName = $types.children[0].name;
            if (!typeName) {
                const foundTypeItem = $types.children.find(
                    (typeItem) => typeItem.name
                );
                if (foundTypeItem) {
                    typeName = foundTypeItem.name;
                }
            }

            // const typesStruct = getNamespace(typeName, true);

            // const $schema = $types.childNamed(typesStruct + 'schema');
            // const $complexTypes = $schema.childrenNamed(
            //     typesStruct + 'complexType'
            // );

            // try to get method node
            const $methodPortType = $portType.childWithAttribute(
                'name',
                methodName
            );
            if (!$methodPortType) {
                throw new Error(
                    'method ("' + methodName + '") not exists in wsdl'
                );
            }

            const $input = $methodPortType.childNamed(wsdlStruct + 'input');
            const $output = $methodPortType.childNamed(wsdlStruct + 'output');

            const $inputMessage = getMessageNode(
                $messages,
                getNameWithoutNamespace($input.attr.message)
            );
            const $outputMessage = getMessageNode(
                $messages,
                getNameWithoutNamespace($output.attr.message)
            );

            return {
                request : getMessageAttrs($inputMessage, $wsdlObj),
                response: getMessageAttrs($outputMessage, $wsdlObj)
            };
        });
    };

    Wsdlrdr.getAllFunctions = function (params, opts) {
        return getWsdl(params, opts).then(function (wsdl) {
            const $wsdlObj = new xmldoc.XmlDocument(wsdl);
            const wsdlStruct = getNamespace($wsdlObj.name, true);

            const $binding = $wsdlObj.childNamed(wsdlStruct + 'binding');
            const $operations = $binding.childrenNamed(
                wsdlStruct + 'operation'
            );

            return $operations
                .map((operationItem) => operationItem.attr.name)
                .sort();
        });
    };
})();
