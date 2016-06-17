///X-loaderにより読み込まれた直後のデータを、扱いやすいように再編集する。
///これはファイル単位：さらに操作オブジェクト単位で用意した方がよいんではないかという想定

function loadJaorm(_xInfo)
{
    
    if (_xInfo == null || _xInfo.FrameInfo == null || _xInfo.FrameInfo.length == 0) { return null; }

    var baseObjIndex = 0;

    for (var i = 0; i < _xInfo.FrameInfo.length; i++) {
        /*
                       object.Meshes[i].traverse(function (child) {
                           if (child instanceof THREE.Mesh) {
                               // pass
                           }
                           if (child instanceof THREE.SkinnedMesh) {
                               if (child.geometry.animations !== undefined || child.geometry.morphAnimations !== undefined) {
                                   child.mixer = new THREE.AnimationMixer(child);
                                   mixers.push(child.mixer);
                                   //アニメーションを割り当てる
                                   var action = child.mixer.clipAction(child.geometry.animations[0]);
                                   //開始する
                                   action.play();
                               }
                           } 
                       });
                       */


        if (_xInfo.FrameInfo[i].name.indexOf('Frame1_jaoum_out_Layer1') > -1) {
            baseObjIndex = i;
        }
        
        if (_xInfo.FrameInfo[i].name.indexOf('Hand_Nigiri_L') > -1) {
            for (var m = 0; m < _xInfo.FrameInfo[baseObjIndex].skeleton.bones.length; m++) {
                if (_xInfo.FrameInfo[baseObjIndex].skeleton.bones[m].name.indexOf('Hand_Nigiri_L') > -1) {
                    _xInfo.FrameInfo[baseObjIndex].skeleton.bones[m].children.push(_xInfo.FrameInfo[i]);
                }
            }
        }

        if (_xInfo.FrameInfo[i].name.indexOf('Hand_Wpn_2_R') > -1) {
            for (var m = 0; m < _xInfo.FrameInfo[baseObjIndex].skeleton.bones.length; m++) {
                if (_xInfo.FrameInfo[baseObjIndex].skeleton.bones[m].name.indexOf('Hand_Wpn_2_R') > -1) {
                    _xInfo.FrameInfo[baseObjIndex].skeleton.bones[m].children.push(_xInfo.FrameInfo[i]);
                }
            }
        }

    }

    return _xInfo.FrameInfo;

}