/**
 * @author Jey-en 
 *
 * This loader loads X file in ASCII Only!!
 *
 * Support
 *  - mesh
 *  - texture
 *  - normal / uv
 *  - material
 *
 *  Not Support
 *  - material(ditail)
 *  - morph
 *  - skinning
 *  - scene
 */


/*
* DirectX用にモデルデータをインポートさせたことがある場合、UVのY座標の解釈が異なっている。
* その場合、このフラグを　true にすると読ませることができるようになる。
*/
XfileLoader_IsUvYReverse = false;

Xdata = function () {

    //Xファイルは1ファイルに多数のメッシュが入ることがあるので、それ用（仮)
    this.Meshes = new Array();

    //2次元配列. [mesh,Bones]
    this.BoneInfs = new Array();

    this.TextureFiles = new Array();
}

XboneInf = function () {
    this.BoneName = "";
    this.Indexes = new Array();
    this.Weits = new Array();
    this.initMatrix = null;
    this.OffsetMatrix = null;
}


XtextureInf = function()
{
    this.Url = "";
    this.MatIndex = -1;
}

//テキスト情報の読み込みモード
// text file Reading Mode
this.XfileLoadMode = {
    none: -1,
    Mesh: 0,
    Element: 1,
    Vartex_init: 10,
    Vartex_Read: 11,
    Index_init: 20,
    index_Read: 21,
    Uv_init: 30,
    Uv_Read: 31,
    Normal_V_init: 40,
    Normal_V_Read: 41,
    Normal_I_init: 42,
    Normal_I_Read: 43,

    Mat_Face_init: 101,
    Mat_Face_len_Read: 102,
    Mat_Face_Set: 103,
    Mat_Set: 111,
    Mat_Set_Texture:112,

    Weit_init: 1001,
    Weit_IndexLength: 1002,
    Weit_Read_Index: 1003,
    Weit_Read_Value: 1004,
    Weit_Read_Matrx: 1005,
}

XfileLoader = function (manager) {

    this.manager = (manager !== undefined) ? manager : THREE.DefaultLoadingManager;

};

XfileLoader.prototype = {

    constructor: XfileLoader,

    //読み込み開始命令部
    load: function (url, onLoad, onProgress, onError) {

        var scope = this;
        var loader = new THREE.XHRLoader(scope.manager);
        loader.setResponseType('arraybuffer');
        loader.load(url, function (text) {

            onLoad(scope.parse(text, url));

        }, onProgress, onError);

    },

    parse: function (data, url) {

        var isBinary = function () {

            var expect, face_size, n_faces, reader;
            reader = new DataView(binData);
            face_size = (32 / 8 * 3) + ((32 / 8 * 3) * 3) + (16 / 8);
            n_faces = reader.getUint32(80, true);
            expect = 80 + (32 / 8) + (n_faces * face_size);

            if (expect === reader.byteLength) {

                return true;

            }

            // some binary files will have different size from expected,
            // checking characters higher than ASCII to confirm is binary
            var fileLength = reader.byteLength;
            for (var index = 0; index < fileLength; index++) {

                if (reader.getUint8(index, false) > 127) {

                    return true;

                }

            }

            return false;

        };

        var binData = this.ensureBinary(data);

        return isBinary()
			? this.parseBinary(binData)
			: this.parseASCII(this.ensureString(data), url);

    },

    /*
    バイナリデータだった場合の読み込み。現在は未対応
    */
    parseBinary: function (data) {

        //ねげちぶ！
        return null;
    },

    /*
    データ読み込み＆解析本体。
    */
    parseASCII: function (data, url) {

        var geometry = null;

        //モデルファイルの元ディレクトリを取得する
        var baseDir ="";
        if (url.lastIndexOf("/") > 0) {
            baseDir = url.substr(0, url.lastIndexOf("/") + 1);
        } 

        //Xfileとして分解できたものの入れ物
        var LoadingXdata = new Xdata();

        // 返ってきたデータを行ごとに分解
        var lines = data.split("\n");

        ///現在の行読み込みもーど
        var nowReadMode = XfileLoadMode.none;

        //現在セット中のメッシュデータ(１つのモデル)
        var nowGeometry = null;

        //Xファイルは要素宣言→要素数→要素実体　という並びになるので、要素数宣言を保持する
        var tgtLength = 0;
        var nowReaded = 0;

        // { の数（ファイル先頭から
        var ElementLv = 0;

        //ジオメトリ読み込み開始時の　{ の数
        var geoStartLv = Number.MAX_VALUE;

        //マテリアル＝表面設定配列
        var materials = new Array();

        var matReadLine = 0;
        var putMatLength = 0;
        var nowMat = null;

        //ボーン情報格納用
        var BoneInf = new XboneInf();
        var nowTextureInfs = new Array();
        var Bones = new Array();

        //UV割り出し用の一時保管配列
        var tmpUvArray = new Array();

        //放線割り出し用の一時保管配列
        //Xfileの放線は「頂点ごと」で入っているので、それを面に再計算して割り当てる。面倒だと思う
        var NormalVectors = new Array();
        var FacesNormal = new Array();

        var textureLoaded = 0;

        //Xファイル解析開始!
        for (var i = 0; i < lines.length; i++) {

            var line = lines[i].trim();

            //後でちゃんと考えるさ･･
            // template が入っていたら、その行は飛ばす！飛ばさなきゃ読める形が増えるだろうけど、後回し　
            if (line.indexOf("template ") > -1) {
                continue;
            }

            if (line.length == 0) {
                continue;
            }

            if (line.indexOf("{") > -1) {
                ElementLv++;
            }

            if (line.indexOf("}") > -1) {
                //カッコが終わった時の動作
                ElementLv--;
                ElementLv = Math.max(ElementLv, 0);
                if (nowGeometry != null && geoStartLv > ElementLv && nowReadMode > XfileLoadMode.none) {
                    //１つのメッシュ終了
                    nowGeometry.computeBoundingBox();
                    nowGeometry.computeBoundingSphere();

                    nowGeometry.verticesNeedUpdate = true;
                    nowGeometry.normalsNeedUpdate = true;
                    nowGeometry.colorsNeedUpdate = true;
                    nowGeometry.uvsNeedUpdate = true;
                    nowGeometry.groupsNeedUpdate = true;

                    var mesh = new THREE.Mesh(nowGeometry, new THREE.MeshFaceMaterial(materials));
                    
                    LoadingXdata.Meshes.push(mesh);
                    LoadingXdata.BoneInfs.push(Bones);

                    nowGeometry = null;
                    nowReadMode = XfileLoadMode.none;
                    geoStartLv = Number.MAX_VALUE;
                }

                if (nowReadMode == XfileLoadMode.Mat_Set) {
                    materials.push(nowMat);
                    nowReadMode = XfileLoadMode.Element;
                }

            }

            ///////////////////////////////////////////////////////////////////
            ////////////////////////////////////////////////////////////////////
            ///Mesh ＝　面データの読み込み開始
            /*  Mesh　は、頂点数（1行または ; ）→頂点データ(;区切りでxyz要素)→面数（index要素数）→index用データ　で成り立つ
            */
            if (line.indexOf("Mesh ") > -1) {
                nowGeometry = new THREE.Geometry();
                geoStartLv = ElementLv;
                nowReadMode = XfileLoadMode.Vartex_init;

                Bones = new Array();
                nowTextureInfs = new Array();
                materials = new Array();
                continue;
            }
            //頂点読み出し
            if (nowReadMode == XfileLoadMode.Vartex_init) {
                nowReadMode = XfileLoadMode.Vartex_Read;
                tgtLength = parseInt(line.substr(0, line.length - 1), 10);
                nowReaded = 0;
                continue;
            }

            if (nowReadMode == XfileLoadMode.Vartex_Read) {

                var data = line.substr(0, line.length - 2); //後ろの   ;, または ;; を無視
                data = data.split(";");
                nowGeometry.vertices.push(new THREE.Vector3(parseFloat(data[0]), parseFloat(data[1]), parseFloat(data[2])));
                nowReaded++;
                if (nowReaded >= tgtLength) {
                    nowReadMode = XfileLoadMode.Index_init;
                    continue;
                }
            }

            //Index読み出し///////////////////
            if (nowReadMode == XfileLoadMode.Index_init) {
                nowReadMode = XfileLoadMode.index_Read;
                tgtLength = parseInt(line.substr(0, line.length - 1), 10);
                nowReaded = 0;
                continue;
            }

            if (nowReadMode == XfileLoadMode.index_Read) {
                // 面に属する頂点数,頂点の配列内index という形で入っている
                var data = line.substr(2, line.length - 4); //3頂点しか対応していない。ので、先頭の２文字 ＆  後ろの   ;, または ;; を無視
                data = data.split(",");
                nowGeometry.faces.push(new THREE.Face3(parseInt(data[0], 10), parseInt(data[1],10), parseInt(data[2],10), new THREE.Vector3( 1,  1, 1).normalize()));
    
                nowReaded++;
                if (nowReaded >= tgtLength) {
                    nowReadMode = XfileLoadMode.Element;
                    continue;
                }
            }

            //Normal部//////////////////////////////////////////////////
            //XFileでのNormalは、頂点毎の向き→面に属してる頂点のID　という順番で入っている。
            if (line.indexOf("MeshNormals ") > -1) {
                nowReadMode = XfileLoadMode.Normal_V_init;
                NormalVectors = new Array();
                FacesNormal = new Array();
                continue;
            }
            if (nowReadMode == XfileLoadMode.Normal_V_init) {
                nowReadMode = XfileLoadMode.Normal_V_Read;
                tgtLength = parseInt(line.substr(0, line.length - 1), 10);
                nowReaded = 0;
                continue;
            }

            if (nowReadMode == XfileLoadMode.Normal_V_Read) {
                var data = line.split(";");
                NormalVectors.push([parseFloat(data[0]), parseFloat(data[1]), parseFloat(data[2])]);
                nowReaded++;
                if (nowReaded >= tgtLength) {
                    nowReadMode = XfileLoadMode.Normal_I_init;
                    continue;
                }
            }
            if (nowReadMode == XfileLoadMode.Normal_I_init) {
                nowReadMode = XfileLoadMode.Normal_I_Read;
                tgtLength = parseInt(line.substr(0, line.length - 1), 10);
                nowReaded = 0;
                continue;
            }
            if (nowReadMode == XfileLoadMode.Normal_I_Read) {

                //やっとNomal放線が決まる
                var data = line.substr(2, line.length - 4);
                data = data.split(",");
                //indexに対応したベクトルを一度取得＆加算し、単位ベクトルを得てからセットする
                var nowID = parseInt(data[0], 10);
                var v1 = new THREE.Vector3(NormalVectors[nowID][0], NormalVectors[nowID][1], NormalVectors[nowID][2]);
                nowID = parseInt(data[1], 10);
                var v2 = new THREE.Vector3(NormalVectors[nowID][0], NormalVectors[nowID][1], NormalVectors[nowID][2]);
                nowID = parseInt(data[2], 10);
                var v3 = new THREE.Vector3(NormalVectors[nowID][0], NormalVectors[nowID][1], NormalVectors[nowID][2]);
                //v1.add(v2); v1.add(v3);

                //nowGeometry.faces[nowReaded].normal = v1.normalize();
                nowGeometry.faces[nowReaded].vertexNormals = [v1, v2, v3];
                FacesNormal.push(v1.normalize());
                nowReaded++;
                if (nowReaded >= tgtLength) {
                    nowReadMode = XfileLoadMode.Element;
                    continue;
                }
            }
            ///////////////////////////////////////////////////////////////

            //UV///////////////////////////////////////////////////////////
            if (line.indexOf("MeshTextureCoords ") > -1) {
                //UV宣言
                nowReadMode = XfileLoadMode.Uv_init;
                continue;
            }
            if (nowReadMode == XfileLoadMode.Uv_init) {
                //まず、セットされるUVの頂点数
                nowReadMode = XfileLoadMode.Uv_Read;
                tgtLength = parseInt(line.substr(0, line.length - 1), 10);
                nowReaded = 0;
                tmpUvArray = new Array();
                nowGeometry.faceVertexUvs[0] = new Array();
                continue;
            }

            if (nowReadMode == XfileLoadMode.Uv_Read) {
                //次にUVを仮の入れ物に突っ込んでいく
                var data = line.split(";");
                //これは宣言された頂点の順に入っていく
                if (XfileLoader_IsUvYReverse) {
                    tmpUvArray.push(new THREE.Vector2(parseFloat(data[0]), 1 - parseFloat(data[1])));
                } else {
                    tmpUvArray.push(new THREE.Vector2(parseFloat(data[0]),  parseFloat(data[1])));
                }

                nowReaded++;
                if (nowReaded >= tgtLength) {
                    //UV読み込み完了。メッシュにUVを割り当てる
                    //geometry.faceVertexUvs[ 0 ][ faceIndex ][ vertexIndex ]
                    nowGeometry.faceVertexUvs[0] = new Array();
                    for (var m = 0; m < nowGeometry.faces.length; m++) {
                        nowGeometry.faceVertexUvs[0][m] = new Array();
                        nowGeometry.faceVertexUvs[0][m].push(tmpUvArray[nowGeometry.faces[m].a]);
                        nowGeometry.faceVertexUvs[0][m].push(tmpUvArray[nowGeometry.faces[m].b]);
                        nowGeometry.faceVertexUvs[0][m].push(tmpUvArray[nowGeometry.faces[m].c]);
                    }

                    nowReadMode = XfileLoadMode.Element;
                    nowGeometry.uvsNeedUpdate = true;
                    continue;
                }
            }
            ////////////////////////////////////////////////////////////

            //マテリアル（面に対するマテリアルの割り当て）//////////////////////////
            if (line.indexOf("MeshMaterialList ") > -1) {
                nowReadMode = XfileLoadMode.Mat_Face_init;
                continue;
            }
            if (nowReadMode == XfileLoadMode.Mat_Face_init) {
                //マテリアル数がここ？今回は特に影響ないようだが
                nowReadMode = XfileLoadMode.Mat_Face_len_Read;
                continue;
            }
            if (nowReadMode == XfileLoadMode.Mat_Face_len_Read) {
                nowReadMode = XfileLoadMode.Mat_Face_Set;
                tgtLength = parseInt(line.substr(0, line.length - 1), 10);
                nowReaded = 0;
                continue;
            }
            if (nowReadMode == XfileLoadMode.Mat_Face_Set) {
                var data = line.split(",");
                nowGeometry.faces[nowReaded].materialIndex = parseInt(data[0]);
                nowReaded++;
                if (nowReaded >= tgtLength) {
                    nowReadMode = XfileLoadMode.Element;
                    continue;
                }
            }

            //マテリアル（マテリアルの要素）
            if (line.indexOf("Material ") > -1) {
                nowReadMode = XfileLoadMode.Mat_Set;
                matReadLine = 0;
                nowMat = new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff });
                continue;
            }

            if (nowReadMode == XfileLoadMode.Mat_Set) {
                var data = line.split(";");
                matReadLine++;
                switch (matReadLine) {
                    case 1:
                        //FaceColor
                        nowMat.color.r = data[0];
                        nowMat.color.g = data[1];
                        nowMat.color.b = data[2];
                        break;
                    case 2:
                        //power

                        break;
                    case 3:
                        //Specular
                        /*
                        nowMat.color.r = data[0];
                        nowMat.color.g = data[1];
                        nowMat.color.b = data[2];
                        */
                        break;
                    case 4:
                        //Emissiv color and put
                        /*
                          nowMat.color.r = data[0];
                          nowMat.color.g = data[1];
                          nowMat.color.b = data[2];
                          */
                        break;
                }             

                if (line.indexOf("TextureFilename") > -1) {
                    nowReadMode = XfileLoadMode.Mat_Set_Texture;
                }
                continue;
            }
            if (nowReadMode == XfileLoadMode.Mat_Set_Texture) {
                //テクスチャのセット
                nowReadMode = XfileLoadMode.Mat_Set;
                var data = line.substr(1, line.length - 3);
                if (data != undefined && data.length > 0 )
                {
                   nowMat.map = Texloader.load(baseDir + data);
                }
               
                i++;    //}しかないつぎの行をとばす。改行のない詰まったデータが来たらどうしようね
                ElementLv--;
                continue;
            }
            /////////////////////////////////////////////////////////////////////////

            //Bone部（仮//////////////////////////////////////////////////////////////////////
            if (line.indexOf("SkinWeights ") > -1 && nowReadMode >= XfileLoadMode.Element) {
                nowReadMode = XfileLoadMode.Weit_init;
                BoneInf = new XboneInf();
                continue;
            }
            if (nowReadMode == XfileLoadMode.Weit_init) {
                //ボーン名称
                nowReadMode = XfileLoadMode.Weit_IndexLength;
                BoneInf.BoneName = line.substr(1, line.length - 3);
                nowReaded = 0;
                continue;
            }
            if (nowReadMode == XfileLoadMode.Weit_IndexLength) {
                //ボーンに属する頂点数
                nowReadMode = XfileLoadMode.Weit_Read_Index;
                tgtLength = parseInt(line.substr(0, line.length - 1), 10);
                nowReaded = 0;
                continue;
            }
            if (nowReadMode == XfileLoadMode.Weit_Read_Index) {
                //ボーンに属する頂点を割り当て
                BoneInf.Indexes.push(parseInt(line.substr(0, line.length - 1), 10));
                nowReaded++;
                if (nowReaded >= tgtLength || line.indexOf(";") > -1) {
                    nowReadMode = XfileLoadMode.Weit_Read_Value;
                    nowReaded = 0;
                }
                continue;
            }
            if (nowReadMode == XfileLoadMode.Weit_Read_Value) {
                //頂点にウェイトを割り当て
                BoneInf.Weits.push(parseFloat(line.substr(0, line.length - 1)));
                nowReaded++;
                if (nowReaded >= tgtLength || line.indexOf(";") > -1) {
                    nowReadMode = XfileLoadMode.Weit_Read_Matrx;
                    Bones.push(BoneInf);
                }
                continue;
            }
            if (nowReadMode == XfileLoadMode.Weit_Read_Matrx) {
                //ボーンの初期Matrix
                var data = line.split(",");
                BoneInf.initMatrix = new THREE.Matrix4();
                BoneInf.initMatrix.set( parseFloat(data[0]), parseFloat(data[1]),parseFloat(data[2]),parseFloat(data[3]),
                                        parseFloat(data[4]), parseFloat(data[5]),parseFloat(data[6]),parseFloat(data[7]),
                                        parseFloat(data[8]), parseFloat(data[9]),parseFloat(data[10]),parseFloat(data[11]),
                                        parseFloat(data[12]), parseFloat(data[13]),parseFloat(data[14]),parseFloat(data[15]) );

                Bones.push(BoneInf);
                nowReadMode = XfileLoadMode.Element;
                continue;
            }
            ///////////////////////////////////////////////////
        }


        return LoadingXdata;

    },

    ensureString: function (buf) {

        if (typeof buf !== "string") {

            var array_buffer = new Uint8Array(buf);
            var str = '';
            for (var i = 0; i < buf.byteLength; i++) {

                str += String.fromCharCode(array_buffer[i]); // implicitly assumes little-endian

            }
            return str;

        } else {

            return buf;

        }

    },

    ensureBinary: function (buf) {

        if (typeof buf === "string") {

            var array_buffer = new Uint8Array(buf.length);
            for (var i = 0; i < buf.length; i++) {

                array_buffer[i] = buf.charCodeAt(i) & 0xff; // implicitly assumes little-endian

            }
            return array_buffer.buffer || array_buffer;

        } else {

            return buf;

        }

    }

};
