(() => {
    'use strict';

    const Wsdlrdr = require('../src/index.js');

    const wsdlUrls = [
        // {
        //     host: "soaptest.parasoft.com",
        //     wsdl: "/calculator.wsdl",
        // },
        {
            host: 'webservices.oorsprong.org',
            wsdl: '/websamples.countryinfo/CountryInfoService.wso?WSDL'
        },
        {
            host: 'webservices.daehosting.com',
            wsdl: '/services/isbnservice.wso?WSDL'
        },
        {
            host: 'www.dataaccess.com',
            wsdl: '/webservicesserver/numberconversion.wso?WSDL'
        },
        {
            host: 'webservices.optimalpayments.com',
            wsdl: '/ilsWS/IlsService/v1?wsdl'
        },
        {
            host: 'svn.apache.org',
            wsdl: '/repos/asf/airavata/sandbox/xbaya-web/test/Calculator.wsdl'
        },
        {
            host: 'www.pegelonline.wsv.de',
            wsdl: '/webservices/version2_4/2009/05/12/PegelonlineWebservice?WSDL'
        }
    ];

    const wsdlOpts = {
        'svn.apache.org': {
            failOnWrongContentType: false
        }
    };
    const wsdlFunctions = [];

    const test = require('tape');

    test('notExistsingWsdlUrl', async (t) => {
        try {
            await Wsdlrdr.getAllFunctions({
                host: 'www.notexist.com',
                wsdl: '/wsdl'
            });

            t.end('has response');
        } catch (err) {
            t.ok(err, 'wsdl not exists');
            t.end();
        }
    });

    test('getNamespaces', async (t) => {
        try {
            for (const wsdlParams of wsdlUrls) {
                t.comment(`=> ${wsdlParams.host}`);
                const data = await Wsdlrdr.getNamespaces(
                    wsdlParams,
                    wsdlOpts[wsdlParams.host]
                );
                t.ok(
                    data.length !== 0,
                    `${wsdlParams.host} has ${data.length} namespaces`
                );
            }
            t.end();
        } catch (err) {
            console.trace(err);
            t.end(err);
        }
    });

    test('getAllFunctions', async (t) => {
        try {
            for (const wsdlParams of wsdlUrls) {
                t.comment(`=> ${wsdlParams.host}`);
                const data = await Wsdlrdr.getAllFunctions(
                    wsdlParams,
                    wsdlOpts[wsdlParams.host]
                );
                t.ok(
                    data.length !== 0,
                    `${wsdlParams.host} has ${data.length} functions`
                );
                // save found functions
                wsdlFunctions[wsdlParams.host] = data;
            }
            t.end();
        } catch (err) {
            console.trace(err);
            t.end(err);
        }
    });

    test('getMethodParamsByName', async (t) => {
        try {
            for (const wsdlParams of wsdlUrls) {
                for (const methodName of wsdlFunctions[wsdlParams.host]) {
                    const methodParams = await Wsdlrdr.getMethodParamsByName(
                        methodName,
                        wsdlParams,
                        wsdlOpts[wsdlParams.host]
                    );
                    t.ok(
                        methodParams,
                        `could get params from method "${methodName}"`
                    );
                    t.ok(methodParams.response, 'response available');
                    t.ok(
                        methodParams.response.find(
                            (responseItem) => responseItem.name === 'parameters'
                        ),
                        'got response parameters'
                    );
                    t.ok(methodParams.request, 'request available');
                    t.ok(
                        methodParams.request.find(
                            (requestItem) => requestItem.name === 'parameters'
                        ),
                        'got request parameters'
                    );

                    for (const responseItem of methodParams.response) {
                        t.ok(responseItem.params, 'got response params');
                    }

                    for (const requestItem of methodParams.request) {
                        t.ok(requestItem.params, 'got request params');
                    }
                }
            }

            t.end();
        } catch (err) {
            console.trace(err);
            t.end(err);
        }
    });

    test('getMethodParamsByName.givenMethodNotExists', async (t) => {
        try {
            const wsdlParams = wsdlUrls[0];
            if (!wsdlParams) {
                t.end('no wsdlParams');
            }

            await Wsdlrdr.getMethodParamsByName(
                'notAvailableMethodName',
                wsdlParams
            );
            t.end('has found method');
        } catch (err) {
            t.ok(err, 'not found method');
            t.end();
        }
    });

    test('getXmlDataAsJson', (t) => {
        t.plan(2);
        const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
            <SOAP-ENV:Envelope
                xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/"
                xmlns:wsdl="http://schemas.xmlsoap.org/"
                xmlns:xsd="http://www.w3.org/2001/"
                xmlns:tns="http://predic8.com/wsdl/"
                xmlns:soap="http://schemas.xmlsoap.org/wsdl/"
            >
            <SOAP-ENV:Body>
                <tns:testResponseItem1>123</tns:testResponseItem1>
                <tns:testResponseItem2>234</tns:testResponseItem2>
            </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`;

        const dataAsJson = Wsdlrdr.getXmlDataAsJson(responseXml);
        if (dataAsJson.testResponseItem1) { t.pass('testResponseItem1 is available'); }
        if (dataAsJson.testResponseItem2) { t.pass('testResponseItem2 is available'); }
    });

    test('getXmlDataAsJson.noBody', (t) => {
        const xml = `<?xml version="1.0" encoding="utf-16"?>
        <CurrentWeather>
            <Location>Leipzig-Schkeuditz, Germany (EDDP) 51-25N 012-14E 149M</Location>
            <Time>Oct 07, 2015 - 06:50 AM EDT / 2015.10.07 1050 UTC</Time>
            <Wind> from the SE (140 degrees) at 6 MPH (5 KT):0</Wind>
            <Visibility> greater than 7 mile(s):0</Visibility>
            <SkyConditions> mostly cloudy</SkyConditions>
            <Temperature> 62 F (17 C)</Temperature>
            <DewPoint> 62 F (17 C)</DewPoint>
            <RelativeHumidity> 100%</RelativeHumidity>
            <Pressure> 29.85 in. Hg (1011 hPa)</Pressure>
            <Status>Success</Status>
        </CurrentWeather>`;

        const dataAsJson = Wsdlrdr.getXmlDataAsJson(xml);

        t.ok(dataAsJson.CurrentWeather.length !== 0, 'data available');
        t.end();
    });

    test('getXmlDataAsJson.array', (t) => {
        const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
            <SOAP-ENV:Envelope
                xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
                xmlns:xs="http://www.w3.org/2001/XMLSchema"
                xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/"
                xmlns:tns="http://www.dataaccess.com/webservicesserver/"
                xmlns:cns0="header-data1"
                xmlns:cns1="header-data2"
                xmlns:cns2="header-data3">
            <SOAP-ENV:Header>
                <cns0:header1>header-data1</cns0:header1>
                <cns1:header2>header-data2</cns1:header2>
                <cns2:header3>header-data3</cns2:header3>
            </SOAP-ENV:Header>
            <SOAP-ENV:Body>
                <getDataTypeResponse>
                    <testParam1>1</testParam1>
                    <testParam2>2</testParam2>
                    <testParam2>3</testParam2>
                </getDataTypeResponse>
            </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`;

        const dataAsJson = Wsdlrdr.getXmlDataAsJson(responseXml);
        t.ok(
            dataAsJson.getDataTypeResponse,
            'getDataTypeResponse is available'
        );
        t.ok(
            dataAsJson.getDataTypeResponse.testParam2.length === 2,
            'testParam2 got 2 items'
        );

        t.end();
    });

    test('getXmlDataAsJson.withAttrValue', (t) => {
        t.plan(1);
        const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
                <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
                <S:Body>
                    <ns5:getDataTypeResponse xmlns:ns5="http://sphinx.dat.de/services/DataTypeService">
                        <vehicleType key="1" value="ValueItem1"/>
                        <vehicleType key="2" value="ValueItem2"/>
                        <vehicleType key="3" value="ValueItem3"/>
                        <vehicleType key="4" value="ValueItem4"/>
                        <vehicleType key="5" value="ValueItem5"/>
                    </ns5:getDataTypeResponse>
                </S:Body>
            </S:Envelope>`;

        const dataAsJson = Wsdlrdr.getXmlDataAsJson(responseXml);
        if (dataAsJson.getDataTypeResponse) { t.pass('getDataTypeResponse is available'); }
    });

    test('getXmlDataAsJson.withAttrInTopTag', (t) => {
        const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
            <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
                <S:Body>
                    <ns5:topLevelTag attribute1="1111" attribute2="2222">
                        <lowerLevelTag attribute1="3333" attribute2="4444">
                            <lowerLEvelTagItem>
                                <tagCollection>
                                    <entry name="test1" value="1234"/>
                                    <entry name="test2" value="5678"/>
                                    <entry name="test3" value="9101"/>
                                    <entry name="test4" value="1213"/>
                                    <entry name="test5" value="1415"/>
                                </tagCollection>
                            </lowerLEvelTagItem>
                        </lowerLevelTag>
                    </ns5:topLevelTag>
                </S:Body>
            </S:Envelope>`;

        const dataAsJson = Wsdlrdr.getXmlDataAsJson(responseXml);

        t.ok(dataAsJson.topLevelTag, 'topLevelTag is available');
        t.ok(
            dataAsJson.topLevelTag.attribute1,
            'topLevelTag.attribute1 is available'
        );
        t.ok(
            dataAsJson.topLevelTag.attribute2,
            'topLevelTag.attribute2 is available'
        );

        t.ok(
            dataAsJson.topLevelTag.lowerLevelTag,
            'lowerLevelTag is available'
        );
        t.ok(
            dataAsJson.topLevelTag.lowerLevelTag.attribute1,
            'lowerLevelTag.attribute1 is available'
        );
        t.ok(
            dataAsJson.topLevelTag.lowerLevelTag.attribute2,
            'lowerLevelTag.attribute2 is available'
        );

        t.end();
    });
})();
