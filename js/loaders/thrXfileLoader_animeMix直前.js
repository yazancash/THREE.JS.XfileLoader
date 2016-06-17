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
* DirectX用にモデルデータを用意した場合、UVのY座標の解釈が異なっている。
* その場合、このフラグを　true にすると読ませることができるようになる。
*/
XfileLoader_IsUvYReverse = false;


//ここにはXfileから読み出した直後の情報、および返却オブジェクトが格納される
Xdata = function () {

    //XFrameInfo Array(final output)
    this.FrameInfo = new Array();

    //XFrameInfo Array
    this.FrameInfo_Raw = new Array();

    //XAnimationInfo Array
    this.ActionInfo = new Array();

    this.AnimationInfo_Raw = new Array();
    this.AnimTicksPerSecond = 30;

    this.nowAnimations = new Array();
}

XFrameInfo = function () {
    this.Mesh = null;
    this.Geometry = null;
    this.FrameName = "";
    this.ParentName = "";
    this.children = new Array();
    this.FrameStartLv = 0;
    this.FrameTransformMatrix = null;
    //XboneInf Array
    this.BoneInfs = new Array();
    this.BoneTree = new Array();
    this.VertexSetedBoneCount = new Array();    //その頂点に対し、いくつBone&Weightを割り当てたかというカウント1

    this.Materials = new Array();
}

XboneInf = function () {
    this.BoneName = "";
    //重要：ボーンを1次元配列化したときの配列内index。skinindexに対応する
    this.BoneIndex = 0;
    //このIndecesは頂点Indexということ
    this.Indeces = new Array();
    this.Weits = new Array();
    this.initMatrix = null;
    this.OffsetMatrix = null;
}

XboneTreeInf = function () {
    //このボーンの「親」のボーン情報
    this.Parent = 0;
    this.children = new Array();
}

XtextureInf = function () {
    this.Url = "";
    this.MatIndex = -1;
}

XAnimationInfo = function () {
    this.AnimeName = "";
    this.BoneName = "";
    this.TargetBone = null;
    //this.KeyType = 0;
    this.FrameStartLv = 0;
    this.KeyFrames = new Array();   //XAnimationKeyInfo Array
    this.InverseMx = null;

}

KeyFrameInfo = function ()
{
    this.Frame = 0;
    //this.EndFrame = 0;
    this.Matrix = null;
}

//テキスト情報の読み込みモード
// text file Reading Mode
this.XfileLoadMode = {
    none: -1,
    Element: 1,
    FrameTransformMatrix_Read: 3,
    Mesh: 5,
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
    Mat_Set_Texture: 112,

    Weit_init: 201,
    Weit_IndexLength: 202,
    Weit_Read_Index: 203,
    Weit_Read_Value: 204,
    Weit_Read_Matrx: 205,

    Anim_init :1001,
    Anim_Reading : 1002,
    Anim_KeyValueTypeRead: 1003,
    Anim_KeyValueLength: 1004,
    Anime_ReadKeyFrame: 1005,

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
        var baseDir = "";
        if (url.lastIndexOf("/") > 0) {
            baseDir = url.substr(0, url.lastIndexOf("/") + 1);
        }

        //Xfileとして分解できたものの入れ物
        var LoadingXdata = new Xdata();

        var ZposFlgPow = 1;
        if (XfileLoader_IsPosZReverse) { ZposFlgPow = -1;}


        // 返ってきたデータを行ごとに分解
        var lines = data.split("\n");

        ///現在の行読み込みもーど
        var nowReadMode = XfileLoadMode.none;

        var nowAnimationKeyType = 4;

        //Xファイルは要素宣言→要素数→要素実体　という並びになるので、要素数宣言を保持する
        var tgtLength = 0;
        var nowReaded = 0;

        // { の数（ファイル先頭から
        var ElementLv = 0;

        //ジオメトリ読み込み開始時の　{ の数
        var geoStartLv = Number.MAX_VALUE;

        //Frame読み込み開始時の　{ の数
        var FrameStartLv = Number.MAX_VALUE;

        var matReadLine = 0;
        var putMatLength = 0;
        var nowMat = null;

        //ボーン情報格納用
        var BoneInf = new XboneInf();
  

        //UV割り出し用の一時保管配列
        var tmpUvArray = new Array();

        //放線割り出し用の一時保管配列
        //Xfileの放線は「頂点ごと」で入っているので、それを面に再計算して割り当てる。面倒だと思う
        var NormalVectors = new Array();
        var FacesNormal = new Array();

        var textureLoaded = 0;

        //現在読み出し中のフレーム名称
        var nowFrameName = "";

        //現在読み出し中のフレームの階層構造。
        var FrameHierarchie = new Array();

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

            //DirectXは[ Frame ] で中身が構成されているため、Frameのツリー構造を一度再現する。
            //その後、Three.jsのObject3D型に合わせて再構築する必要がある

            if (line.indexOf("{") > -1) {
                ElementLv++;
            }

            if (line.indexOf("}") > -1) {
                //カッコが終わった時の動作
                if (ElementLv < 1 || nowFrameName == "") { ElementLv = 0; continue; }
              
                if (nowReadMode < XfileLoadMode.Anim_init && LoadingXdata.FrameInfo_Raw[nowFrameName].FrameStartLv == ElementLv && nowReadMode > XfileLoadMode.none) {

                    //１つのFrame終了
                    if (FrameHierarchie.length > 0) {
                        //「子」を探して、セットする
                        LoadingXdata.FrameInfo_Raw[nowFrameName].children = new Array();
                        var keys = Object.keys(LoadingXdata.FrameInfo_Raw);
                        for (var m = 0; m < keys.length; m++) {
                            if (LoadingXdata.FrameInfo_Raw[keys[m]].ParentName == nowFrameName) {
                                LoadingXdata.FrameInfo_Raw[nowFrameName].children.push(keys[m]);
                            }
                        }
                        FrameHierarchie.pop();
                    }


                    this.MakeOutputGeometry(LoadingXdata, nowFrameName);

                    FrameStartLv = LoadingXdata.FrameInfo_Raw[nowFrameName].FrameStartLv;

                    //読み込み中のフレームを一段階上に戻す
                    if (FrameHierarchie.length > 0) {
                        nowFrameName = FrameHierarchie[FrameHierarchie.length - 1];
                        FrameStartLv = LoadingXdata.FrameInfo_Raw[nowFrameName].FrameStartLv;
                    } else {
                        nowFrameName = "";
                    }
                }

                if (nowReadMode == XfileLoadMode.Mat_Set) {
                    //子階層を探してセットする                    
                    LoadingXdata.FrameInfo_Raw[nowFrameName].Materials.push(nowMat);
                    nowReadMode = XfileLoadMode.Element;
                }

                ElementLv--;
                continue;
            }

            ///////////////////////////////////////////////////////////////////

            if (line.indexOf("Frame ") > -1) {
                //１つのFrame開始
                FrameStartLv = ElementLv;
                nowReadMode = XfileLoadMode.Element;

                nowFrameName = line.substr(6, line.length - 8);
                LoadingXdata.FrameInfo_Raw[nowFrameName] = new XFrameInfo();
                LoadingXdata.FrameInfo_Raw[nowFrameName].FrameName = nowFrameName;
                //親の名前がすぐわかるので、この段階でセット
                if (FrameHierarchie.length > 0){
                    LoadingXdata.FrameInfo_Raw[nowFrameName].ParentName = FrameHierarchie[FrameHierarchie.length -1];
                }
                FrameHierarchie.push(nowFrameName);
                LoadingXdata.FrameInfo_Raw[nowFrameName].FrameStartLv = FrameStartLv;
                continue;
            }

            if (line.indexOf("FrameTransformMatrix") > -1) {
                nowReadMode = XfileLoadMode.FrameTransformMatrix_Read;
                continue;
            }

            if (nowReadMode == XfileLoadMode.FrameTransformMatrix_Read) {
                var data = line.split(",");
                LoadingXdata.FrameInfo_Raw[nowFrameName].FrameTransformMatrix = new THREE.Matrix4();
                this.ParseMatrixData(LoadingXdata.FrameInfo_Raw[nowFrameName].FrameTransformMatrix, data);

                nowReadMode = XfileLoadMode.Element;
                continue;
            }

            ////////////////////////////////////////////////////////////////////
            ///Mesh ＝　面データの読み込み開始
            /*  Mesh　は、頂点数（1行または ; ）→頂点データ(;区切りでxyz要素)→面数（index要素数）→index用データ　で成り立つ
            */
            if (line.indexOf("Mesh ") > -1) {

                LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry = new THREE.Geometry();
                geoStartLv = ElementLv;
                nowReadMode = XfileLoadMode.Vartex_init;

                Bones = new Array();
                LoadingXdata.FrameInfo_Raw[nowFrameName].Materials = new Array();
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
                //頂点が確定
                var data = line.substr(0, line.length - 2); //後ろの   ;, または ;; を無視
                data = data.split(";");
                LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.vertices.push(new THREE.Vector3(parseFloat(data[0]), parseFloat(data[1]), parseFloat(data[2])));
                //頂点を作りながら、Skin用構造も作成してしまおう
                LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.skinIndices.push(new THREE.Vector4(0, 0, 0, 0));
                LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.skinWeights.push(new THREE.Vector4(1, 0, 0, 0));
                LoadingXdata.FrameInfo_Raw[nowFrameName].VertexSetedBoneCount.push(0);

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
                LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faces.push(new THREE.Face3(parseInt(data[0], 10), parseInt(data[1], 10), parseInt(data[2], 10), new THREE.Vector3(1, 1, 1).normalize()));

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
                LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faces[nowReaded].vertexNormals = [v1, v2, v3];
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
                LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faceVertexUvs[0] = new Array();
                continue;
            }

            if (nowReadMode == XfileLoadMode.Uv_Read) {
                //次にUVを仮の入れ物に突っ込んでいく
                var data = line.split(";");
                //これは宣言された頂点の順に入っていく
                if (XfileLoader_IsUvYReverse) {
                    tmpUvArray.push(new THREE.Vector2(parseFloat(data[0]), 1 - parseFloat(data[1])));
                } else {
                    tmpUvArray.push(new THREE.Vector2(parseFloat(data[0]), parseFloat(data[1])));
                }

                nowReaded++;
                if (nowReaded >= tgtLength) {
                    //UV読み込み完了。メッシュにUVを割り当てる
                    //geometry.faceVertexUvs[ 0 ][ faceIndex ][ vertexIndex ]
                    LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faceVertexUvs[0] = new Array();
                    for (var m = 0; m < LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faces.length; m++) {
                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faceVertexUvs[0][m] = new Array();
                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faceVertexUvs[0][m].push(tmpUvArray[LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faces[m].a]);
                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faceVertexUvs[0][m].push(tmpUvArray[LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faces[m].b]);
                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faceVertexUvs[0][m].push(tmpUvArray[LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faces[m].c]);
                    }

                    nowReadMode = XfileLoadMode.Element;
                    LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.uvsNeedUpdate = true;
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
                LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.faces[nowReaded].materialIndex = parseInt(data[0]);
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
                if (data != undefined && data.length > 0) {
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
                BoneInf.BoneIndex = LoadingXdata.FrameInfo_Raw[nowFrameName].BoneInfs.length;
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
                BoneInf.Indeces.push(parseInt(line.substr(0, line.length - 1), 10));
                nowReaded++;
                if (nowReaded >= tgtLength || line.indexOf(";") > -1) {
                    nowReadMode = XfileLoadMode.Weit_Read_Value;
                    nowReaded = 0;
                }
                continue;
            }
            if (nowReadMode == XfileLoadMode.Weit_Read_Value) {
                //頂点にウェイトを割り当て
                var nowVal = parseFloat(line.substr(0, line.length - 1));
                BoneInf.Weits.push(nowVal);   
                nowReaded++;
                if (nowReaded >= tgtLength || line.indexOf(";") > -1) {
                    nowReadMode = XfileLoadMode.Weit_Read_Matrx;
                }
                continue;
            }
            if (nowReadMode == XfileLoadMode.Weit_Read_Matrx) {
                //ボーンの初期Matrix
                var data = line.split(",");
                BoneInf.initMatrix = new THREE.Matrix4();
                this.ParseMatrixData(BoneInf.initMatrix, data);

                BoneInf.OffsetMatrix = new THREE.Matrix4();
                BoneInf.OffsetMatrix.getInverse(BoneInf.initMatrix);
                LoadingXdata.FrameInfo_Raw[nowFrameName].BoneInfs.push(BoneInf);
                nowReadMode = XfileLoadMode.Element;
                continue;
            }
            ///////////////////////////////////////////////////

            //アニメーション部
            ////////////////////////////////////////////////////////////
            //ここからは、Frame構造とは切り離して考える必要がある。
            //別ファイルに格納されている可能性も考慮しよう
            if (line.indexOf("AnimationSet ") > -1) {
                FrameStartLv = ElementLv;
                nowReadMode = XfileLoadMode.Anim_init;
                continue;
            }

            if (line.indexOf("Animation ") > -1 && nowReadMode == XfileLoadMode.Anim_init) {
                //アニメーション構造開始。
                nowFrameName = line.substr(10, line.length - 11).trim();    //10ってのは　Animations  の文字数。 11は Animations に末尾の  { を加えて、11
                LoadingXdata.AnimationInfo_Raw[nowFrameName] = new XAnimationInfo();
                LoadingXdata.AnimationInfo_Raw[nowFrameName].AnimeName = nowFrameName;
                LoadingXdata.AnimationInfo_Raw[nowFrameName].FrameStartLv = FrameStartLv;
                //ここはちょっと悪いコード。
                //次に来る「影響を受けるボーン」は、{  }  が１行で来るという想定･･･かつ、１つしかないという想定。
                //想定からずれるものがあったらカスタマイズしてくれ･･そのためのオープンソースだ。
                while (true) {
                    i++;
                    line = lines[i].trim();
                    if (line.indexOf("{") > -1 && line.indexOf("}") > -1) {
                        LoadingXdata.AnimationInfo_Raw[nowFrameName].BoneName = line.replace(/{/g, "").replace(/}/g, "").trim();
                        break;
                    }
                }
                continue;
            }

            if (line.indexOf("AnimationKey ") > -1) {
                nowReadMode = XfileLoadMode.Anim_KeyValueTypeRead;
                continue;
            }

            if (nowReadMode == XfileLoadMode.Anim_KeyValueTypeRead) {
                nowAnimationKeyType = parseInt(line.substr(0, line.length - 1), 10);
                nowReadMode = XfileLoadMode.Anim_KeyValueLength;
                continue;
            }

            if (nowReadMode == XfileLoadMode.Anim_KeyValueLength) {
                tgtLength = parseInt(line.substr(0, line.length - 1), 10);
                nowReaded = 0;
                nowReadMode = XfileLoadMode.Anime_ReadKeyFrame;
                continue;
            }
            //やっとキーフレーム読み込み
            if (nowReadMode == XfileLoadMode.Anime_ReadKeyFrame) {
                var KeyInfo = new KeyFrameInfo();
                var data = line.split(";");
                KeyInfo.Frame = parseInt(data[0], 10);
                /*
                KeyInfo.EndFrame = 0;
                if (LoadingXdata.AnimationInfo_Raw[nowFrameName].KeyFrames.length > 0 && 
                    LoadingXdata.AnimationInfo_Raw[nowFrameName].KeyFrames[LoadingXdata.AnimationInfo_Raw[nowFrameName].KeyFrames.length - 1].BeginFrame < KeyInfo.BeginFrame) {
                    LoadingXdata.AnimationInfo_Raw[nowFrameName].KeyFrames[LoadingXdata.AnimationInfo_Raw[nowFrameName].KeyFrames.length - 1].EndFrame = KeyInfo.BeginFrame;
                }
                */
                KeyInfo.Matrix = new THREE.Matrix4();
                data = data[2].split(",");
                switch (nowAnimationKeyType) {
                    case 0: KeyInfo.Matrix.makeRotationFromQuaternion(new THREE.Quaternion(parseFloat(data[0]), parseFloat(data[1]), parseFloat(data[2]))); break;
                    case 1: KeyInfo.Matrix.makeScale(parseFloat(data[0]), parseFloat(data[1]), parseFloat(data[2])); break;
                    case 2: KeyInfo.Matrix.makeTranslation(parseFloat(data[0]), parseFloat(data[1]), parseFloat(data[2])); break;
                        //case 3: KeyInfo.Matrix.makeScale(parseFloat(data[0]), parseFloat(data[1]), parseFloat(data[2])); break;
                    case 4:
                        this.ParseMatrixData(KeyInfo.Matrix, data);
                        break;
                }

                LoadingXdata.AnimationInfo_Raw[nowFrameName].KeyFrames.push(KeyInfo);
                nowReaded++;
                if (nowReaded >= tgtLength || line.indexOf(";;;") > -1) {
                    nowReadMode = XfileLoadMode.Anim_init
                }
                continue;
            }

        }

        //アニメーション情報、ボーン構造などを再構築
        LoadingXdata.FrameInfo = new Array();
        var keys = Object.keys(LoadingXdata.FrameInfo_Raw);
        for (var i = 0 ; i < keys.length; i++) {
            if(LoadingXdata.FrameInfo_Raw[keys[i]].Mesh != null)
            {
                LoadingXdata.FrameInfo.push(LoadingXdata.FrameInfo_Raw[keys[i]].Mesh);
            }
        }

        //最終的にはモデルデータとアニメデータが別ファイルで来ることも想定し、ここのブロックは1ファイル内では呼ばれないという想定をしている
        keys = Object.keys(LoadingXdata.AnimationInfo_Raw);
        for (var i = 0; i < keys.length; i++) {
            if (LoadingXdata.AnimationInfo_Raw[keys[i]] != null) {                
                //ボーンとアニメーションを紐付ける
                var find = false;
                for (var m = 0; m < LoadingXdata.FrameInfo.length; m++) {
                    if (LoadingXdata.FrameInfo[m] instanceof THREE.SkinnedMesh === true) {
                        for (var b = 0; b < LoadingXdata.FrameInfo[m].skeleton.bones.length; b++)
                        {
                            if (LoadingXdata.FrameInfo[m].skeleton.bones[b].name == LoadingXdata.AnimationInfo_Raw[keys[i]].BoneName) {

                                //LoadingXdata.AnimationInfo_Raw[keys[i]].TargetBone = LoadingXdata.FrameInfo[m].skeleton.bones[b];

                                find = true;
                                break;
                            }
                        }
                    }
                    if (find) { break; }
                }
            }
        }


        return LoadingXdata;

    },

    ///行データをMatrixにセットする
    ParseMatrixData: function (targetMatrix, data) {

        //if (targetMatrix == null) { targetMatrix = new THREE.Matrix4(); }

        /*  directXとopenGLの違いの吸収。あーいやだ嫌だ
        targetMatrix.set(parseFloat(data[0]), parseFloat(data[1]), parseFloat(data[2]), parseFloat(data[3]),
                                parseFloat(data[4]), parseFloat(data[5]), parseFloat(data[6]), parseFloat(data[7]),
                                parseFloat(data[8]), parseFloat(data[9]), parseFloat(data[10]), parseFloat(data[11]),
                                parseFloat(data[12]), parseFloat(data[13]), parseFloat(data[14]), parseFloat(data[15]));
        */
        targetMatrix.set(
                      parseFloat(data[0]), parseFloat(data[4]), parseFloat(data[8]), parseFloat(data[12]),
                      parseFloat(data[1]), parseFloat(data[5]), parseFloat(data[9]), parseFloat(data[13]),
                      parseFloat(data[2]), parseFloat(data[6]), parseFloat(data[10]), parseFloat(data[14]),
                      parseFloat(data[3]), parseFloat(data[7]), parseFloat(data[11]), parseFloat(data[15]));

    },

    //最終的に出力されるTHREE.js型のメッシュ（Geometry)を確定する
    MakeOutputGeometry: function (LoadingXdata,  nowFrameName) {

        if (LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry != null) {

            //１つのmesh終了
            LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.computeBoundingBox();
            LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.computeBoundingSphere();

            LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.verticesNeedUpdate = true;
            LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.normalsNeedUpdate = true;
            LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.colorsNeedUpdate = true;
            LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.uvsNeedUpdate = true;
            LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.groupsNeedUpdate = true;

            //ボーンの階層構造を作成する
            //BoneはFrame階層基準で作成、その後にWeit割り当てのボーン配列を再セットする
            var putBones = new Array();
            var BoneDics = new Array();
            var rootBone = new THREE.Bone();
            var keys = Object.keys(LoadingXdata.FrameInfo_Raw);
            var BoneDics_Name = new Array();
            for (var m = 0; m < keys.length; m++) {
                if (LoadingXdata.FrameInfo_Raw[keys[m]].FrameStartLv <= LoadingXdata.FrameInfo_Raw[nowFrameName].FrameStartLv && nowFrameName != keys[m]) { continue; }

                var b = new THREE.Bone();
                b.name = keys[m];
                b.applyMatrix(LoadingXdata.FrameInfo_Raw[keys[m]].FrameTransformMatrix);
                b.matrixWorld = b.matrix;
                BoneDics_Name[b.name] = putBones.length;
                putBones.push(b);
            }


            //今度はボーンの親子構造を作成するために、再度ループさせる
            for (var m = 0; m < putBones.length; m++) {
                for (var dx = 0; dx < LoadingXdata.FrameInfo_Raw[putBones[m].name].children.length; dx++) {
                    var nowBoneIndex = BoneDics_Name[LoadingXdata.FrameInfo_Raw[putBones[m].name].children[dx]];
                    if (putBones[nowBoneIndex] != null) {
                        putBones[m].add(putBones[nowBoneIndex]);
                    }
                }
            }

            var mesh = null;
            if (putBones.length > 0) {
                if (LoadingXdata.FrameInfo_Raw[putBones[0].name].children.length == 0 && nowFrameName != putBones[0].name) {
                    putBones[0].add(putBones[1]);
                }

                //さらに、ウェイトとボーン情報を紐付ける
                for (var m = 0; m < putBones.length; m++) {
                    for (var bi = 0; bi < LoadingXdata.FrameInfo_Raw[nowFrameName].BoneInfs.length; bi++) {
                        if (putBones[m].name == LoadingXdata.FrameInfo_Raw[nowFrameName].BoneInfs[bi].BoneName) {
                            //ウェイトのあるボーンであることが確定。頂点情報を割り当てる
                            for (var vi = 0; vi < LoadingXdata.FrameInfo_Raw[nowFrameName].BoneInfs[bi].Indeces.length; vi++) {
                                //頂点へ割り当て
                                var nowVertexID = LoadingXdata.FrameInfo_Raw[nowFrameName].BoneInfs[bi].Indeces[vi];
                                var nowVal = LoadingXdata.FrameInfo_Raw[nowFrameName].BoneInfs[bi].Weits[vi];

                                switch (LoadingXdata.FrameInfo_Raw[nowFrameName].VertexSetedBoneCount[nowVertexID]) {
                                    case 0:
                                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.skinIndices[nowVertexID].x = m;
                                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.skinWeights[nowVertexID].x = nowVal;
                                        break;
                                    case 1:
                                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.skinIndices[nowVertexID].y = m;
                                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.skinWeights[nowVertexID].y = nowVal;
                                        break;
                                    case 2:
                                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.skinIndices[nowVertexID].z = m;
                                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.skinWeights[nowVertexID].z = nowVal;
                                        break;
                                    case 3:
                                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.skinIndices[nowVertexID].w = m;
                                        LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry.skinWeights[nowVertexID].w = nowVal;
                                        break;
                                }
                                LoadingXdata.FrameInfo_Raw[nowFrameName].VertexSetedBoneCount[nowVertexID]++;
                            }
                        }
                    }
                }

                for (var sk = 0; sk < LoadingXdata.FrameInfo_Raw[nowFrameName].Materials.length; sk++) {
                    LoadingXdata.FrameInfo_Raw[nowFrameName].Materials[sk].skinning = true;
                }

                mesh = new THREE.SkinnedMesh(LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry, new THREE.MeshFaceMaterial(LoadingXdata.FrameInfo_Raw[nowFrameName].Materials));
                var skeleton = new THREE.Skeleton(putBones);
                mesh.add(putBones[0]);
                mesh.bind(skeleton);

                skeletonHelper = new THREE.SkeletonHelper(mesh);
                skeletonHelper.material.linewidth = 2;
                scene.add(skeletonHelper);
            }
            else {
                mesh = new THREE.Mesh(LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry, new THREE.MeshFaceMaterial(LoadingXdata.FrameInfo_Raw[nowFrameName].Materials));
            }
            mesh.name = nowFrameName;
            LoadingXdata.FrameInfo_Raw[nowFrameName].Mesh = mesh;
            LoadingXdata.FrameInfo_Raw[nowFrameName].Geometry = null;
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

////////////////////////////////////////////////////////////////
Xdata.prototype = {
    constructor: Xdata,


};

//ボーンとそれに紐付けられたキーフレーム。
//ボーン1種類毎に１つ用意される。
XAnimateBone = function()
{
    this.TargetBone = null;
    this.KeyFrames = null;
}

XAnimateBone.prototype = {
    constructor: XAnimateBone,
    
    setBoneMatrixFromKeyFrame: function (_keyFrameNum) {

        var boneMxValue = new THREE.Matrix4();

        for (var m = 0; m < this.KeyFrames.length; m++) {
            if (this.KeyFrames[m].Frame >= _keyFrameNum) {
                if (this.KeyFrames[m].Frame == _keyFrameNum) {
                    boneMxValue.copy( this.KeyFrames[m].Matrix);
                }
                else {
                    //終了キーとの中間キーをセットする
                    if (this.KeyFrames.length > 0) {

                        boneMxValue.copy(  this.LerpKeyFrame(_keyFrameNum,
                                                this.KeyFrames[m - 1].Frame,
                                                this.KeyFrames[m - 1].Matrix,
                                                this.KeyFrames[m].Frame,
                                                this.KeyFrames[m].Matrix));
                    } else {
                        boneMxValue.copy(  this.KeyFrames[m].Matrix);
                    }
                }
                break;
            }
        }

        /*
        this.TargetBone.matrix = new THREE.Matrix4();
        this.TargetBone.applyMatrix(boneMxValue);
        this.TargetBone.updateMatrix();
        this.TargetBone.matrixWorldNeedsUpdate = true;
        */

    },

    //2つのキーフレームの線形保管Matrixを作成する
    LerpKeyFrame: function (nowKey, baseBeginKey, beginMatrix, baseEndKey, endMatrix) {

        if (baseBeginKey == nowKey) { return beginMatrix; }
        if (baseEndKey == nowKey) { return endMatrix; }

        var absKeyEnd = baseEndKey - baseBeginKey;
        nowKey = nowKey - baseBeginKey;

        if (nowKey <= 0) { return beginMatrix; }

        var nowPow = nowKey / absKeyEnd;

        return LerpMatrix(beginMatrix, endMatrix, nowPow);
    }

};

///
XActionInfo = function () {
    this.ActionName = "";
    this.beginKey = 0;
    this.beginTime = 0;
 
    this.endKey = 0;
    this.endTime = 0;

    this.nowTime = 0;
    this.nowKeyFrameTime = 0;

    this.isLoop = false;

    this.isAnimation = false;

}

XActionInfo.prototype = {
    constructor: XActionInfo,

    begin: function () {
        this.nowTime = 0;
        this.isAnimation = true;
        //this.setAnimateBone(0);
    },

    update: function (_dul) {
        this.nowTime += _dul;
        if (this.nowTime > this.endTime) {
            if (this.isLoop) {
                this.nowTime = 0;
            }
            else {
                this.nowTime = this.endTime;
            }
        }

        var nowPow = this.nowTime / this.endTime;

        //値をキーフレーム数に直す
        nowPow = this.beginKey + nowPow * (this.endKey - this.beginKey);
        this.nowKeyFrameTime = Math.floor(nowPow);

        //this.setAnimateBoneFromKeyFrame(Math.floor(nowPow));

    },

};


///////////////////////////////////////////////////////////////////////////


XAnimationObject = function () {
    this.Geometry = null;

    //XAnimateBone Array
    this.AnimateBones = null;

    //XAnimationInfo Array
    this.ActionInfo = new Array();


    this.AnimTicksPerSecond = 30;

    this.nowAnimations = new Array();
}

XAnimationObject.prototype = {
    constructor: XAnimationObject,

    ///ボーンとキーフレームをリンクさせ、アニメーションを行うようにする
    set: function (_geometry, _animations) {
        this.Geometry = _geometry
        this.AnimateBones = new Array();

        var keys = Object.keys(_animations);

        if (this.Geometry instanceof THREE.SkinnedMesh === true) {
            for (var b = 0; b < this.Geometry.skeleton.bones.length; b++) {

                for (var i = 0; i < keys.length; i++) {
                    if (_animations[keys[i]] != null) {
                        if (this.Geometry.skeleton.bones[b].name == _animations[keys[i]].BoneName) {

                            nowBone = new XAnimateBone();
                            nowBone.TargetBone = this.Geometry.skeleton.bones[b];
                            nowBone.KeyFrames = _animations[keys[i]].KeyFrames;

                            this.AnimateBones.push(nowBone);
                            break;
                        }
                    }
                }

            }
        }
    },

    //新セット登録
    createAnimation: function (animeName, beginkey, endKey, isLoop) {
        var nowAnime = new XActionInfo();
        nowAnime.AnimationName = animeName;
        nowAnime.beginKey = beginkey;
        nowAnime.endKey = endKey;
        nowAnime.isLoop = isLoop;
        nowAnime.endTime = (endKey - beginkey) / this.AnimTicksPerSecond;
        nowAnime.endTime = nowAnime.endTime * 1000; //ミリ秒にする   
        this.ActionInfo[animeName] = nowAnime;

    },

    beginAnimation: function (animeName) {
        this.ActionInfo[animeName].begin();
        this.nowAnimations.push(animeName);
    },

    AnimationUpdate: function () {
        this.ActionInfo[this.nowAnimations[0]].update();
        this.Geometry.updateMatrix();
    },

    update: function (_dul) {
        for (var i = 0; i < this.nowAnimations.length; i++) {
            this.ActionInfo[this.nowAnimations[i]].update(_dul);

            this.setAnimateBoneFromKeyFrame(this.ActionInfo[this.nowAnimations[i]].nowKeyFrameTime);
        }

        this.Geometry.updateMatrix();
    },


    ///キーフレームの値を指定し、ボーンをセットする
    setAnimateBoneFromKeyFrame: function (_keyFrame) {
        //ボーン毎にループ
        for (var i = 0; i < this.AnimateBones.length; i++) {
            //ボーンに位置をセット
            this.AnimateBones[i].setBoneMatrixFromKeyFrame(_keyFrame);
        }
    },


};


////////////////////////////////////////////////////////////////////////////////////////


function LerpMatrix(Matrix1, Matrix2, pow) {

    if (pow == 0) { return Matrix1; }
    if (pow == 1) { return Matrix2; }

    var tmpMx = new THREE.Matrix4();

    var pos1 = new THREE.Vector3();
    var pos2 = new THREE.Vector3();

    pos1.set(Matrix1.elements[12], Matrix1.elements[13], Matrix1.elements[14]);
    pos2.set(Matrix2.elements[12], Matrix2.elements[13], Matrix2.elements[14]);

    pos1 = pos1.lerp(pos2, pow);

    var q1 = new THREE.Quaternion();
    var q2 = new THREE.Quaternion();
    q1.setFromRotationMatrix(Matrix1);
    q2.setFromRotationMatrix(Matrix2);

    q1.slerp(q2, pow);

    tmpMx.makeRotationFromQuaternion(q1);
    tmpMx.setPosition(pos1);

    return tmpMx;

}